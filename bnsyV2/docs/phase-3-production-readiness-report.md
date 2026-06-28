# Phase 3 任务 G：V2 生产前清单（Production Readiness）

> 本报告依据 Phase 3 任务规格第十章，汇总 V2 进入小范围真实单号试运行前必须确认的 12 项内容。
> 报告基于 Phase 0 ~ Phase 3 已完成的代码审查、静态验证、端到端验收结果。

---

## 1. 当前已完成阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | 项目初始化与全面隔离（端口/数据库/Docker/runtime/配置） | ✅ 完成 |
| Phase 1 | Playwright 原生浏览器 POC（launchPersistentContext + session 持久化） | ✅ 完成 |
| Phase 2-A | PlaywrightWindowAdapter 设计与实现 | ✅ 完成 |
| Phase 2-B | Adapter 任务接入验证 | ✅ 完成 |
| Phase 2-C | Engine 层接入方案设计与审查 | ✅ 完成 |
| Phase 2-D | sign 任务接入 Playwright Runtime（Engine 层 + WINDOW_RUNTIME_MODE 开关） | ✅ 完成 |
| Phase 2-D-Run | 真实 Chrome 可视化端到端验收（channel=chrome, headless=false, P0 前置, 密码弹窗禁用） | ✅ 完成 |
| Phase 2-E | arrival / dispatch / integrated 批量接入 Playwright Runtime（46/46 检查通过） | ✅ 完成 |
| Phase 3 | 全链路回归与生产化收敛（文档统一 / 启动指南 / 异常路径验证 / 生产前清单） | ✅ 完成 |

详细阶段文档归档于 `docs/` 目录。

---

## 2. 已验证模块

| 模块 | taskType | Playwright Runtime | 真实 Chrome | P0 前置 | 窗口复用 | 验收报告 |
|------|----------|--------------------|-------------|---------|----------|----------|
| 签收录入 | sign | ✅ | ✅ | ✅ | ✅ | phase-2d-run-real-chrome-report.md |
| 到件扫描 | arrival | ✅ | ✅ | ✅ | ✅ | phase-2e-all-modules-runtime-report.md |
| 派件扫描 | dispatch | ✅ | ✅ | ✅ | ✅ | phase-2e-all-modules-runtime-report.md |
| 到派一体 | integrated | ✅ | ✅ | ✅ | ✅ | phase-2e-all-modules-runtime-report.md |

**验收脚本**：`scripts/multi-runtime-mode-verify.ts`（46/46 检查通过）

---

## 3. 当前默认 runtime

```text
WINDOW_RUNTIME_MODE 默认值：legacy_easybr
```

**代码依据**：`backend/config/runtimeMode.ts`

```typescript
export function getRuntimeMode(): WindowRuntimeMode {
  const raw = process.env.WINDOW_RUNTIME_MODE;
  if (raw === 'playwright') return 'playwright';
  return 'legacy_easybr';  // 默认
}
```

**安全保障**：
- 未设置 env → 默认 legacy_easybr
- env 空字符串 → 默认 legacy_easybr
- env 非法值 → 默认 legacy_easybr
- 仅严格匹配 `'playwright'` 才切换

**生产建议**：上线初期保持默认 `legacy_easybr`，待小范围试运行稳定后再通过 env 切换 playwright。

---

## 4. 如何开启 playwright

### 4.1 临时启用（PowerShell 当前会话）

```powershell
$env:WINDOW_RUNTIME_MODE="playwright"
cd bnsyV2
npm run dev
```

### 4.2 持久启用（.env 文件）

修改 `bnsyV2/.env`：

```text
WINDOW_RUNTIME_MODE=playwright
```

重启后端生效。

### 4.3 验证是否生效

后端启动日志应出现：

```text
[Engine] runtimeMode=playwright taskType=sign usePlaywright=true
```

或调用 POC API：

```bash
curl http://localhost:3200/api/runtime-mode
# 期望返回 {"runtimeMode":"playwright"}
```

### 4.4 allowlist 范围

playwright 模式下仅以下 taskType 走 Adapter：

```text
sign / arrive / arrival / dispatch / integrated
```

其他 taskType 即使在 playwright 模式下仍走 legacy 路径（兜底保护）。

---

## 5. 如何回退 legacy_easybr

### 5.1 紧急回退

```powershell
# 清除 env
Remove-Item Env:\WINDOW_RUNTIME_MODE -ErrorAction SilentlyContinue

# 或显式设置
$env:WINDOW_RUNTIME_MODE="legacy_easybr"

# 重启后端
npm run dev
```

### 5.2 持久回退

修改 `bnsyV2/.env`：

```text
WINDOW_RUNTIME_MODE=legacy_easybr
```

或直接注释该行。

### 5.3 验证回退

后端日志：

```text
[Engine] runtimeMode=legacy_easybr taskType=sign usePlaywright=false
```

详见：
- `docs/v2-start-debug-rollback-guide.md` 第 4 章
- `docs/phase-3-legacy-rollback-verification.md`

---

## 6. Chrome 可视化验证方式

### 6.1 强制非 headless

**代码硬编码**：
- `backend/playwright-runtime/PlaywrightRuntime.ts` L114：`headless: opts.headless ?? false`
- `backend/window-adapter/PlaywrightWindowAdapter.ts` L99/L154：`headless: false`

**约束**：Phase 2-D-Run 已确认 `headless=false` 是硬约束，禁止使用无头浏览器。

### 6.2 POC API 验证

```bash
# 拉起真实 Chrome 窗口
curl -X POST http://localhost:3200/api/window-adapter-poc/launch \
  -H "Content-Type: application/json" \
  -d '{"staffName":"测试员工","keepOpen":true}'
```

### 6.3 验证脚本

```bash
npx tsx scripts/multi-runtime-mode-verify.ts \
  --site site-default \
  --staff 测试员工
```

验证项包括：
- channel='chrome'
- headless=false
- 真实 Chrome 窗口弹出
- P0 前置检查通过
- 任务后窗口 ready
- 第二次任务复用窗口

### 6.4 窗口不关闭机制

- 启动时传 `--keep-open` 或 POC API `keepOpen: true`
- 任务结束 `markReady` 在 finally 块中无条件执行
- 不调用 `context.close()`

---

## 7. P0 检查机制

### 7.1 检查内容（7 项）

| 序号 | 检查项 | 说明 |
|------|--------|------|
| 1 | cdp_evaluate | CDP 协议可评估页面 |
| 2 | url_access | URL 可访问 |
| 3 | url_domain | URL 域名正确 |
| 4 | url_login | 登录页 URL 检测 |
| 5 | url_dashboard | 仪表盘 URL 检测 |
| 6 | dom_missing | 核心 DOM 元素存在 |
| 7 | popup_blocking | 弹窗检测与处理 |

### 7.2 实现文件

- `backend/playwright-runtime/P0Verifier.ts`：复用 `BrowserPool.verifyReady` 7 项检查逻辑
- `scripts/lib/p0-check.ts`：测试辅助封装

### 7.3 失败处理

- P0 检查失败 → 立即停止执行
- 不提交任务
- 不生成 unknown 报告
- 返回明确的失败原因

### 7.4 报告字段

P0 检查报告必须包含：
- 复用函数名
- 起始/结束 URL
- dashboard 状态
- 核心 DOM 存在性
- 弹窗检测结果
- 处理尝试次数
- 最终结果

---

## 8. 密码保存弹窗处理

### 8.1 双重禁用策略

**Chrome 启动参数**（`backend/playwright-runtime/PlaywrightRuntime.ts` L122-123）：

```typescript
args: [
  '--disable-save-password-bubble',
  '--disable-password-manager-reauthentication',
  '--disable-features=PasswordManagerOnboarding,PasswordLeakDetection',
]
```

**Profile Preferences 写入**（L585-592）：

```json
{
  "credentials_enable_service": false,
  "profile": {
    "password_manager_enabled": false
  }
}
```

### 8.2 实现文件

- `disableChromePasswordManager()` 方法位于 `PlaywrightRuntime.ts`
- 写入失败仅记录 warning，不阻塞启动
- 合并写入，不覆盖已有 cookies/session

### 8.3 教训

**禁止**通过 page.click 处理密码弹窗（不可靠，可能误点业务按钮）。必须通过启动参数 + Profile Preferences 双重禁用。

---

## 9. V1/V2 数据关系

### 9.1 资源完全隔离

| 资源 | V1 / bnsy-operator | V2 / bnsyV2 |
|------|---------------------|--------------|
| 前端端口 | 5173 | 5275 |
| 后端端口 | 3100 | 3200 |
| PostgreSQL 端口 | 5434 | 5435 |
| Redis 端口 | 6379 | 6380 |
| 数据库名 | bnsy_operator | daopai_next |
| DB 用户 | bnsy | daopai |
| Docker 容器名 | bnsy-* | daopai-next-* |
| runtime 根目录 | logs/ + screenshots/ | runtime/ |
| settings.json | bnsy-operator/data/settings.json | bnsyV2/data/settings.json |
| 浏览器管理 | EasyBR 指纹浏览器 | Playwright 原生 |

### 9.2 允许的跨项目操作

- ✅ V2 测试脚本**只读** `../bnsy-operator/data/settings.json`（提取测试网点/员工信息）

### 9.3 严禁的跨项目操作

- ❌ V2 业务代码 import V1 代码
- ❌ V2 运行时依赖 V1 的 EasyBR / 数据库 / 端口
- ❌ 修改 V1（`bnsy-operator/`）任何文件
- ❌ V2 访问 V1 生产数据库 / settings.json / EasyBR 窗口

### 9.4 测试账号

- 测试账号凭据必须通过环境变量传递：
  - `BNSY_TEST_USERNAME`
  - `BNSY_TEST_PASSWORD`
- 严禁硬编码、完整日志记录、提交到 Git

---

## 10. 仍需真实单号验证的内容

### 10.1 Phase 2-E 已用测试单号

```text
TEST-SIGN-001       签收录入
TEST-ARRIVAL-001    到件扫描
TEST-DISPATCH-001   派件扫描
TEST-INTEGRATED-001 到派一体
```

这些单号仅用于验证 runtime 路径与窗口生命周期，**不验证真实业务结果**。

### 10.2 真实单号试运行待验证项

| 验证项 | 说明 | 优先级 |
|--------|------|--------|
| 真实签收单号 | 验证 SignHandler 业务流程完整 | 高 |
| 真实到件单号 | 验证 ArrivalHandler 业务流程完整 | 高 |
| 真实派件单号 | 验证 DispatchHandler 业务流程完整 | 高 |
| 真实到派一体单号 | 验证 IntegratedHandler 业务流程完整 | 高 |
| 多员工并发 | 多个 staffName 同时执行任务 | 中 |
| 长时间运行 | 任务执行 4 小时以上窗口稳定性 | 中 |
| Chrome 异常重启 | 任务中 Chrome 崩溃后自愈 | 中 |
| 网络抖动 | 网络中断后任务恢复 | 低 |

### 10.3 试运行建议

- **范围**：单个网点、单个员工、单 taskType 起步
- **观察期**：至少 1 个完整工作日
- **回退预案**：发现异常立即切回 `legacy_easybr`
- **数据保留**：试运行期间任务日志保留至少 7 天

---

## 11. 上线前注意事项

### 11.1 环境变量检查清单

```text
☐ WINDOW_RUNTIME_MODE（playwright 或 legacy_easybr，明确设置）
☐ BNSY_TEST_USERNAME（仅测试环境）
☐ BNSY_TEST_PASSWORD（仅测试环境）
☐ POSTGRES_*（数据库连接配置）
☐ REDIS_*（Redis 连接配置）
```

### 11.2 服务启动顺序

```text
1. Docker（PostgreSQL + Redis）
2. V2 后端（npm run dev）
3. V2 前端（npm run dev）
4. 验证后端日志 runtimeMode 正确
5. 验证前端窗口状态显示
```

### 11.3 资源占用预估

| 资源 | 单窗口预估 | 5 窗口预估 |
|------|------------|------------|
| Chrome 内存 | ~300MB | ~1.5GB |
| Chrome CPU | ~5% | ~25% |
| 磁盘（profile） | ~50MB | ~250MB |
| 网络连接 | 1 条 | 5 条 |

### 11.4 监控指标

- 窗口状态分布（offline/ready/busy/degraded）
- 任务成功率（按 taskType 分组）
- P0 检查通过率
- 平均任务执行时长
- Chrome 进程数（防止僵尸进程）

### 11.5 备份策略

- V2 数据库每日备份
- runtime/profiles/ 定期清理（保留最近 7 天）
- runtime/logs/ 定期归档

---

## 12. 人工异常恢复步骤

### 12.1 窗口卡 busy 状态

**现象**：前端窗口状态长时间显示"执行中"，任务已完成。

**恢复步骤**：

```text
1. 检查后端日志，确认任务是否真的在执行
2. 如果任务已结束但状态未更新，调用：
   POST /api/sites/:siteId/windows/:windowId/reset
3. 如果 reset 失败，重启后端
4. 重启后窗口应自动恢复为 offline → connecting → ready
```

**根因排查**：
- 检查 AssignmentEngine finally 块是否执行
- 检查 WindowLockManager.release 是否调用
- 检查 PlaywrightWindowAdapter.markReady 是否报错

### 12.2 Chrome 僵尸进程

**现象**：任务结束后 Chrome 进程未退出，CPU 占用高。

**恢复步骤**：

```powershell
# 查找 Chrome 进程
Get-Process chrome | Where-Object { $_.MainWindowTitle -like "*daopai*" }

# 终止指定进程
Stop-Process -Id <PID>

# 或终止所有 Chrome（谨慎）
# Stop-Process -Name chrome -Force
```

**预防**：
- 确保 `keepOpen=false` 在非调试场景
- 定期检查 `runtime/profiles/` 大小
- 后端重启时清理孤儿 Chrome 进程

### 12.3 P0 检查持续失败

**现象**：所有任务 P0 检查失败，无法执行。

**恢复步骤**：

```text
1. 检查 Chrome 是否能正常打开目标网站
2. 检查网络连接
3. 检查测试账号是否过期
4. 手动登录一次，刷新 session
5. 清理 runtime/profiles/ 重新初始化
6. 切回 legacy_easybr 应急
```

### 12.4 数据库连接失败

**现象**：后端启动报 PostgreSQL 连接错误。

**恢复步骤**：

```bash
# 检查 Docker 容器
docker ps | grep daopai-next-postgres

# 重启容器
docker compose restart postgres

# 验证连接
docker exec -it daopai-next-postgres psql -U daopai -d daopai_next -c "SELECT 1;"
```

### 12.5 紧急全量回退

**适用场景**：V2 出现严重问题，需要立即切回 V1 生产。

```text
1. 停止 V2 前端
2. 停止 V2 后端
3. 启动 V1 前端（端口 5173）
4. 启动 V1 后端（端口 3100）
5. 通知所有用户切换到 V1 入口
6. V2 数据保留，不影响 V1
```

**注意**：V1 与 V2 资源完全隔离，V2 故障不会影响 V1 已有运行实例。

---

## 13. 生产前清单总结

| 序号 | 检查项 | 状态 | 备注 |
|------|--------|------|------|
| 1 | 当前已完成阶段 | ✅ | Phase 0~3 全部完成 |
| 2 | 已验证模块 | ✅ | sign/arrival/dispatch/integrated |
| 3 | 当前默认 runtime | ✅ | legacy_easybr |
| 4 | 如何开启 playwright | ✅ | env + 重启 |
| 5 | 如何回退 legacy_easybr | ✅ | env + 重启 |
| 6 | Chrome 可视化验证方式 | ✅ | headless=false 硬编码 |
| 7 | P0 检查机制 | ✅ | 7 项检查 + 失败停止 |
| 8 | 密码保存弹窗处理 | ✅ | 双重禁用 |
| 9 | V1/V2 数据关系 | ✅ | 完全隔离 + 只读 settings.json |
| 10 | 仍需真实单号验证的内容 | ⚠️ | 列出 8 项待验证 |
| 11 | 上线前注意事项 | ✅ | env/启动/资源/监控/备份 |
| 12 | 人工异常恢复步骤 | ✅ | 5 类异常场景 |

---

## 14. 结论与建议

### 14.1 当前状态

V2 已完成 Phase 0~3 全部技术准备工作：
- ✅ 资源隔离完成
- ✅ Playwright 原生 Chrome 接入完成
- ✅ 4 个业务模块 runtime 验证通过
- ✅ 文档体系完整
- ✅ 异常路径静态验证通过
- ✅ 回退能力验证通过
- ✅ 生产前清单完整

### 14.2 进入小范围试运行的建议

**建议**：✅ 可以进入真实单号小范围试运行。

**前提条件**：
1. 保持默认 `legacy_easybr` 不变
2. 小范围 = 单网点 + 单员工 + 单 taskType
3. 准备好回退预案
4. 试运行期间密切监控窗口状态与任务日志
5. 试运行稳定 1 个工作日后，再逐步扩大范围

**风险等级**：低
- V1 完全不受影响
- V2 回退能力完整
- 异常恢复步骤明确
- 资源完全隔离

### 14.3 不建议立即执行的操作

- ❌ 直接全量切换到 playwright 模式
- ❌ 多网点同时启用
- ❌ 在未完成真实单号验证前删除 legacy 路径
- ❌ 在试运行期间修改 4 个 Handler / routes.ts / BrowserPool

---

## 附：相关文档索引

| 文档 | 用途 |
|------|------|
| `README.md` | 项目总览与快速开始 |
| `docs/v2-start-debug-rollback-guide.md` | 启动调试回滚操作手册 |
| `docs/phase-3-exception-path-report.md` | 异常路径验证报告 |
| `docs/phase-3-legacy-rollback-verification.md` | legacy 回退验证报告 |
| `docs/phase-2e-all-modules-runtime-report.md` | Phase 2-E 端到端验收报告 |
| `docs/phase-2d-run-real-chrome-report.md` | Phase 2-D-Run 真实 Chrome 验收报告 |
| `docs/development-rules.md` | 开发约束 |
| `docs/project-boundary.md` | 项目边界说明 |
