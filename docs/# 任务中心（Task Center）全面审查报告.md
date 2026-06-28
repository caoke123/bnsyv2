# 任务中心（Task Center）全面审查报告
审查日期 : 2026-06-24
 审查范围 : 前后端完整实现，不涉及代码修改
 项目 : bnsy-operator（笨鸟速运网点操作中心）

## 目录
1. 总体架构概览
2. 后端任务引擎
3. 任务生命周期与状态机
4. 任务清理机制
5. API 路由层审查
6. 前端 UI 设计与实现
7. 任务详情体系（日志/运单/截图/导出）
8. 数据持久化策略
9. 问题与风险点
10. 总结评价
## 1. 总体架构概览
### 1.1 分层架构
### 1.2 核心设计原则
- 统一引擎模式 (Phase D-1)：所有任务类型（arrive/dispatch/sign/integrated/init_window）共用同一 AssignmentEngine ，通过 TaskHandler 接口实现开闭原则
- 配置驱动前端 (Phase D-2B)： UnifiedTaskPage + TaskPageConfig 实现多业务页面复用
- 双数据库策略 ：开发环境 JSON 文件存储 + 生产环境 SQLite，同时并行 PostgreSQL 为未来换代做准备
- 抢占式窗口锁 ： WindowLockManager 保证同一窗口同时只被一个任务占用
### 1.3 支持的任务类型
类型 标识 Handler 操作类 到件扫描 arrival ArrivalHandler ArriveScanBatch 派件扫描 dispatch DispatchHandler DispatchScan 签收录入 sign SignHandler SignScan 到派一体 integrated IntegratedHandler IntegratedScan 窗口初始化 init_window InitWindowHandler 内联逻辑

## 2. 后端任务引擎
### 2.1 AssignmentEngine（统一任务执行引擎）
文件 : src/modules/assignment-engine/AssignmentEngine.ts

引擎是任务中心的核心，实现了完整的任务生命周期管理。

并发模型 ：

- 使用 Promise.all 并发执行多个 Assignment （每个 Assignment 对应一个 Worker 窗口）
- Arrival 通常只有 1 个 Assignment；Dispatch/Integrated/Sign 可有多个 Assignment
Handler 抽象 ( handlers/TaskHandler.ts )：

Handler 仅负责业务逻辑，不涉及锁管理/连接获取/DB 更新，职责分离清晰。

进度模型 (Phase I) ：

- 废除全量 allResults 内存缓存，改用 totalDone / totalFail 计数器
- 每批次结果通过 db.appendTaskResults() 增量追加（不再一次性 stringify）
- 简易 Promise 链 ( writeChain ) 保证同一任务写入串行，避免竞态覆盖
- 同时写入 PostgreSQL（fire-and-forget）
### 2.2 超时与取消体系 (Phase G-2/G-3)
三层超时保护 ：

策略 超时值 作用 空闲超时 90s 无进度 → 终止 主策略：防卡死 首次进度宽限 120s 内无首次心跳 → 终止 防启动失败 绝对上限 按类型不同（5min~30min） 兜底：防死循环 Handler 硬超时 默认 30min（ handlerTimeoutMs ） 单 Handler 级别

取消机制 ：

- AbortController 统一管理：外部取消 / 空闲超时 / 绝对上限均通过 abort() 终止
- cancelControllers Map 存储所有运行任务
- 取消时先 abort → 再写 DB cancelled → 再从 Map 删除（防止内存泄漏）
- Handler 收到 AbortError 后在 finally 块中强制释放锁
### 2.3 窗口锁管理
文件 : src/browser/WindowLockManager.ts

- 抢占式 ：acquire 失败立即抛 WindowBusyError ，不排队
- 锁粒度 ：windowId（不使用 staffName）
- release 幂等 ：重复释放不报错
- 内存锁 ：服务重启即清空
- 超时锁检测 ： getOverdueLocks() + 定时巡检（60s），超 5 分钟自动释放
- busy 续租 ：每 60s 续租一次 busy TTL，防止长任务被误杀
- zombie busy 检测 ：90s 巡检，发现锁已释放但 busy 残留 → 强制清理
## 3. 任务生命周期与状态机
### 3.1 状态流转
状态定义 ： 'pending' | 'running' | 'done' | 'failed' | 'cancelled'

- pending ：任务已创建，等待 Engine 执行
- running ：Engine 已开始执行
- done ：所有 Assignment 正常完成（含部分失败，只要不是全部失败）
- failed ：全部结果失败 或 异常终止 或 超时
- cancelled ：用户手动取消 或 优雅停机触发
### 3.2 任务创建流程
1. 前端提交请求 → API 校验参数 + site 有效性
2. 速率保护 ：令牌桶机制，每秒最多 1 个提交（ checkTaskRate() ）
3. db.createTask() 创建任务记录（状态 pending ）
4. 立即返回 { taskId, status: 'pending' }
5. 异步调用 engine.execute() （不 await，fire-and-forget）
### 3.3 任务执行流程
## 4. 任务清理机制
### 4.1 僵尸任务恢复 (Phase G-1/H)
入口 : 服务启动时调用 cleanupRunningTasks() → AssignmentEngine.recoverRunningTasks()

特点 ：

- 兼容所有任务类型（Arrival/Dispatch/Integrated/Sign），禁止业务特判
- 写入日志： "Service restarted unexpectedly — 系统重启导致任务中断"
- 同时清理所有残留窗口锁 ( WindowLockManager.getOverdueLocks(0) )
### 4.2 优雅停机 (Phase H)
文件 : src/index.ts

完整流程：

1. isShuttingDown = true → 中间件拦截新请求（白名单放行 /api/status 、 /health ）
2. cancelAllRunningTasks() → 每个 Handler 收到 AbortError → 锁释放
3. 等待 2s 让 Handler finally 块执行完毕
4. 停止心跳 → 断开 CDP → 写回 db.json
5. 10 秒硬兜底 → 超时则 process.exit(1)
### 4.3 定时巡检
巡检项 间隔 作用 refreshConnectionStatus 30s 窗口连接健康检查 getOverdueLocks 60s 超时锁自动释放（5 分钟阈值） getOverdueBusy 60s Zombie busy 检测（90s 阈值） dismissAllPopups 30s 清理弹窗

### 4.4 TaskLogManager 内存清理
文件 : src/utils/TaskLogManager.ts

- 每个任务最多保留 200 条 日志
- 最多保留 100 个 任务（超出则删除最旧任务的所有日志）
- 提供 clearLogs(taskId) 方法主动删除
- 注意 ：这是纯内存存储，服务重启全部丢失（PGC 持久化日志不受影响）
## 5. API 路由层审查
### 5.1 任务操作 API
端点 方法 功能 文件位置 /api/operations/arrive POST 提交到件任务 routes.ts#L664 /api/operations/dispatch POST 提交派件任务 routes.ts#L758 /api/operations/integrated POST 提交到派一体任务 routes.ts#L820 /api/operations/sign POST 提交签收任务 routes.ts#L882 /api/operations/:taskId GET 查询任务进度+结果 routes.ts#L946 /api/operations/:taskId/logs GET 查询任务日志(内存) routes.ts#L982 /api/operations GET 历史任务列表 routes.ts#L1118 /api/tasks/:taskId/cancel POST 取消运行中任务 routes.ts#L1050

### 5.2 任务详情 API（基于 PgDatabase）
端点 方法 功能 /api/tasks/:id/logs GET 查询任务日志(PG) /api/tasks/:id/waybills GET 查询运单明细(支持 status 过滤) /api/tasks/:id/summary GET 任务摘要聚合查询

### 5.3 统一校验模式
所有任务提交 API 均包含：

1. site 参数有效性校验（对比 SettingsManager 配置）
2. assignments 数组结构校验
3. 速率保护 （ checkTaskRate() ，1 秒间隔）
4. 立即返回 + 异步执行的响应模式
### 5.4 值得注意的问题
- 两套日志 API ： /api/operations/:taskId/logs 读内存 TaskLogManager， /api/tasks/:id/logs 读 PG。前端 TasksPage 用的是 PG 版本，UnifiedTaskPage 用的是内存版本。任务重启后内存日志丢失。
- Arrival 提交兼容两种模式 ：支持新 assignments 格式和多窗口并发，也向后兼容旧的 waybillNos 单 Worker 模式。
- Sign 任务特殊处理 ： totalCount = assignments.length （每个员工 1 个占位运单），且 SIGN_DRY_RUN=true 预览模式。
## 6. 前端 UI 设计与实现
### 6.1 双页面架构
TasksPage （任务中心主页面）:

- 文件： frontend/src/pages/TasksPage.tsx
- 功能：任务列表看板 + 详情抽屉 + 异常处理 + 时间线
- 数据源： getTaskList() + getTaskSummary() + getTaskWaybills() + getTaskLogsById() (全部 PG)
UnifiedTaskPage （统一任务执行页面）:

- 文件： frontend/src/pages/UnifiedTaskPage.tsx
- 功能：运单录入 + 任务提交 + 进度轮询 + 实时日志
- 数据源： submitTask() + getTaskProgress() + getTaskLogs() (内存 API)
- 使用配置驱动模式，由 TaskPageConfig 控制
### 6.2 TasksPage 布局设计
### 6.3 TasksPage 详情抽屉（TaskDetailDrawer）
三 Tab 设计：

- 概览 ：进度条 + SVG 环形图（成功/失败/部分成功/待核实）+ 任务元信息（类型/网点/状态/耗时）
- 运单明细 ：筛选工具栏 + 运单列表 + 一键复制异常单号 + 底部统计
- 执行日志 ：暗色终端风格 + 实时轮询(3s) + 自动滚动 + 级别着色
日志轮询 ：仅当 task.status === 'running' 且当前 Tab 为 logs 时启动 3s 轮询

### 6.4 UnifiedTaskPage 布局设计
### 6.5 关键组件
组件 文件 职责 TaskPageLayout components/task/TaskPageLayout.tsx 统一页面布局容器 TaskStatCard components/task/TaskStatCard.tsx 统计卡片（支持高亮色条） TaskLogPanel components/task/TaskLogPanel.tsx 实时日志组件（含同类汇总） TaskActionBar components/task/TaskActionBar.tsx 操作按钮（开始/暂停/停止/重置） WaybillInput components/task/WaybillInput.tsx 运单录入（防抖解析） WorkerSelector components/task/WorkerSelector.tsx 多员工选择器 ExecutionStatusCard components/shared/ExecutionStatusCard.tsx 执行状态卡（进度条+统计）

### 6.6 TaskLogPanel 的日志聚合算法
同类日志按 type + message 分组：info/warning 保持原样不合并；error/success 同 message 合并为一条，标注总数 (共N条) 。这在大量运单失败时能有效减少 UI 条目数。

### 6.7 日志类型三层映射
转换函数集中在 lib/log-utils.ts ， apiLogToUiEntry() 负责 Layer 2→3 映射。

## 7. 任务详情体系（日志/运单/截图/导出）
### 7.1 日志体系
三层日志存储 ：

层级 实现 持久化 API 内存日志 TaskLogManager (Map) ❌ 服务重启丢失 /api/operations/:taskId/logs PG 日志 PgDatabase.insertTaskLogs() ✅ /api/tasks/:id/logs 日志缓冲 Engine 内 pgLogBuffer ✅（攒批写入PG） 内部

日志字段 ： id, taskId, timestamp, level(info/warning/error), message, source, staffName?, windowId?

写入策略 ：

- Engine 内部同时写内存 + PG 缓冲
- PG 缓冲每 50 条或任务结束时通过 flushPgLogs() 批量写入
- 写入失败使用 fire-and-forget 模式，不阻塞 RPA
### 7.2 运单结果体系
结果存储 ：

存储 方法 说明 JSONL 文件 db.appendTaskResults() JSON 模式：追加到 data/results/{taskId}.jsonl SQLite db.appendTaskResults() task_results 表 PG pgDb.insertWaybillResults() waybill_results 表 PG 运单池 pgDb.upsertWaybillPool() waybill_pool 表（对账基石）

容错措施 ：

- JSONL 坏行跳过：某行 JSON.parse 失败 → 跳过继续读
- IO 异常隔离：写入失败仅记日志，不崩溃引擎
- 读取时自动聚合多批次数据
运单状态枚举 ： SUCCESS | PARTIAL | FAILED | UNKNOWN_NEEDS_MANUAL_CHECK

### 7.3 截图功能
文件 : src/screenshots/captureFailure.ts

- 仅用于失败场景： captureSignFailureScreenshot()
- 存储路径： screenshots/ 目录（项目根目录下）
- 文件命名： page_{pageNum}_{timestamp}_{signer}_{label}.png
- 超时限制：5 秒超时（ page.screenshot({ timeout: 5000 }) ）
- 容错：截图失败返回空字符串 '' ，不中断任务
使用位置 ：仅在 SignScan.executeSign() 的 catch 块中调用（签收任务失败时截图）

观察 ：其他任务类型（arrival/dispatch/integrated）的失败场景未启用截图功能，这是一个潜在的覆盖率缺口。

### 7.4 执行报告
文件 : src/reports/executionReport.ts

ExecutionReportBuilder 为签收任务提供结构化报告：

- 开始/结束时间、耗时
- 页级统计（总页数/成功/失败/跳过）
- 签收人分布统计（本人/家人/家门口/代收点）
- 错误详情列表（含截图路径）
- 支持 Dry-Run 模式区分
注意 ：此报告仅在 SignScan 中使用，其他任务类型未使用。

### 7.5 数据导出
前端实现 （TasksPage 异常处理中心）：

- "复制所有异常单号"按钮 ：筛选 !r.success 的运单号 → navigator.clipboard.writeText() 复制到剪贴板 + Toast 提示
- "导出异常 Excel"按钮 ：UI 已就绪但功能为 空实现 （ onClick 对应的处理函数仅 disabled 逻辑，无实际导出逻辑）
- 运单明细 Tab 中也有"复制所有异常单号"按钮 + 按 status 筛选
当前缺失 ：Excel/CSV 导出功能未实际实现。异常处理中心的"导出异常 Excel"按钮仅做 UI 展示。

## 8. 数据持久化策略
### 8.1 双数据库架构
环境 数据库 存储 开发 ( NODE_ENV !== 'production' ) JSON 文件 data/db.json + data/results/*.jsonl 生产 ( NODE_ENV === 'production' ) SQLite data/bnsy.db 未来规划 PostgreSQL 7 张表（已就绪并行运行）

### 8.2 PgDatabase（PostgreSQL）
文件 : src/db/PgDatabase.ts
 Schema : scripts/db/init-schema.sql

表结构 ：

1. sites — 网点表
2. windows — 窗口配置表
3. tasks — 任务表（含 JSONB GIN 索引支持运单号反查）
4. waybill_results — 运单明细表（核心改进：一行一条）
5. task_logs — 任务日志表
6. metrics_snapshots — 指标快照表
7. waybill_pool — 运单状态池（INSERT ON CONFLICT DO UPDATE，对账基石）
8. system_settings — 系统设置键值表
性能设计 ：

- insertWaybillResults() 使用一条 SQL 多行 VALUES 模式，支持万单级批量写入
- upsertWaybillPool() 使用 PostgreSQL INSERT ... ON CONFLICT DO UPDATE
- 全部参数化查询（ $1, $2, ... ），防 SQL 注入
- 连接池上限 20，连接超时 5s，空闲超时 30s
### 8.3 当前 PG 集成状态
PG 作为 非阻塞辅助存储 运行（fire-and-forget 模式）：

- 写入失败不中断 RPA 流程
- 与现有 Database.ts 并行运行
- 仍处于验证过渡阶段
## 9. 问题与风险点
### 9.1 严重问题
# 问题 位置 影响 1 导出异常 Excel 功能空实现 TasksPage.tsx#L830 用户点击无任何反馈 2 截图仅覆盖 Sign 任务 SignScan.ts#L147-150 Arrival/Dispatch/Integrated 失败无截图 3 两套日志系统数据源不一致 routes.ts#L982 vs routes.ts#L997 前端不同页面读到不同数据源

### 9.2 中等问题
# 问题 位置 影响 4 内存日志服务重启丢失 TaskLogManager.ts UnifiedTaskPage 查看历史任务日志为空 5 TaskActionBar 暂停/继续仅为 UI 占位 TaskActionBar.tsx onPauseResume 回调无实际后端暂停逻辑 6 任务取消不支持 pending 状态 routes.ts#L1081 pending 任务无法取消，只能等 running 7 init_window TaskType 未纳入 Database 类型定义 Database.ts#L24 TaskType 缺少 'init_window' 8 ExecutionReportBuilder 仅用于 Sign executionReport.ts 其他任务类型无结构化执行报告

### 9.3 架构层面观察
# 观察 说明 9 Database 双模式维护成本高 JSON 模式和 SQLite 模式逻辑高度重复，随着功能增长维护成本将线性增加 10 PgDatabase 与 Database 字段不一致 Database.TaskStatus 含 cancelled ，但 PgDatabase.updateTaskStatus 的 status 参数是 string 类型，无类型约束 11 前端 TasksPage 无实时轮询 需手动刷新才能看到任务状态变化（详情抽屉中的 running 任务日志有 3s 轮询） 12 WaybillInput 仅处理文本录入 无 Excel 文件上传解析功能（注释提到"支持Excel整列复制"但仅为粘贴文本）

### 9.4 健壮性评估
优点 ：

- Engine 的 try-catch 覆盖完整，异常不会导致进程崩溃
- unhandledRejection / uncaughtException 全局兜底
- IO 异常隔离（写入失败仅记日志）
- JSONL 坏行容错读取
- 窗口锁 finally 强制释放
- 优雅停机完整（拒绝新请求 → 取消任务 → 释放锁 → 断开连接）
不足 ：

- failResults 在 Assignment 级失败时生成 status 为 'FAILED' 而非 'FAILED' （字符串），与 WaybillResultStatus 的 'FAILED' 一致，但与枚举值 FAILED 格式统一性问题
- PgDatabase 写入失败仅 console.error，无告警聚合/重试机制
## 10. 总结评价
### 10.1 整体成熟度
维度 评分 说明 架构设计 ★★★★☆ 统一引擎模式 + Handler 抽象 + 配置驱动前端，设计优秀 异常处理 ★★★★☆ 多层超时 + AbortController + 优雅停机，覆盖全面 数据持久化 ★★★☆☆ 双 DB 并行但维护成本高，PG 仍在过渡期 UI/UX 设计 ★★★★☆ 布局清晰、颜色统一、交互合理，但部分按钮空实现 任务清理 ★★★★★ 僵尸恢复 + 锁巡检 + busy 续租 + 优雅停机，机制完备 可观测性 ★★★☆☆ 日志完整但内存不持久，截图仅覆盖 Sign，无指标面板 代码质量 ★★★★☆ 类型定义清晰、职责分离明确、注释规范

### 10.2 核心亮点
1. AssignmentEngine 统一执行引擎 ——设计优雅， TaskHandler 接口实现真正的开闭原则
2. 三层超时 + AbortController ——空闲超时 + 绝对上限 + 外部取消，防卡死机制完备
3. 配置驱动前端 —— UnifiedTaskPage + TaskPageConfig 减少重复代码
4. 优雅停机 ——10 秒限时、白名单放行健康检查、任务取消→锁释放链路完整
5. 运单状态池（waybill_pool） ——为未来总部/商户对账奠定了数据基础
6. 日志三类聚合 ——内存实时日志 + PG 持久日志 + UI 同类汇总
### 10.3 优先修复建议
1. 实现 Excel 导出功能 ——当前按钮为空实现，用户点击无反馈
2. 统一日志数据源 ——内存日志应持久化或前端切换统一读 PG
3. 扩展截图覆盖 ——Arrival/Dispatch/Integrated 失败场景也应截图
4. 完善 TaskType 类型 ——补充 init_window 到 Database.TaskType
5. 实现暂停/继续后端逻辑 ——当前仅为 UI 占位
6. 支持 pending 状态任务取消 ——或从列表隐藏 pending 任务避免困惑