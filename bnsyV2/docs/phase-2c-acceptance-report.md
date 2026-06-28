# Phase 2-C 验收报告：真实任务链路接入前审计与 Adapter 模式开关设计

> 阶段：DaoPai Next Phase 2-C
> 范围：审计现有正式任务链路，设计 PlaywrightWindowAdapter 的渐进接入方案和模式开关
> 前置：Phase 2-B 补充验收已通过（adapter_test 已登录场景真实执行成功）
> 验收日期：2026-06-27

---

## 一、是否修改业务代码

**否。本阶段仅新增审计文档，未修改任何业务代码。**

| # | 文件 | 类型 | 说明 |
|---|------|------|------|
| 1 | `docs/phase-2c-runtime-integration-audit.md` | 新增 | Phase 2-C 审计文档（15 项内容） |
| 2 | `docs/phase-2c-acceptance-report.md` | 新增 | Phase 2-C 验收报告（本文件） |

**文件修改时间验证**（PowerShell `Get-ChildItem` 输出）：

| 文件 | LastWriteTime | 验证结果 |
|------|---------------|----------|
| `docs/phase-2c-runtime-integration-audit.md` | 2026-06-27 17:36 | ✅ Phase 2-C 期间新增 |
| `backend/.../handlers/SignHandler.ts` | 2026-06-26 14:37 | ✅ 未修改（早于 Phase 2-C） |
| `backend/.../handlers/ArrivalHandler.ts` | 2026-06-26 14:36 | ✅ 未修改 |
| `backend/.../handlers/DispatchHandler.ts` | 2026-06-26 14:36 | ✅ 未修改 |
| `backend/.../handlers/IntegratedHandler.ts` | 2026-06-26 18:51 | ✅ 未修改 |
| `backend/api/routes.ts` | 2026-06-26 22:16 | ✅ 未修改 |

---

## 二、是否修改正式 Handler

**否。**

以下 4 个正式业务 Handler 文件均未修改（修改时间均为 2026-06-26，早于 Phase 2-C 的 2026-06-27）：
- `backend/modules/assignment-engine/handlers/ArrivalHandler.ts`
- `backend/modules/assignment-engine/handlers/DispatchHandler.ts`
- `backend/modules/assignment-engine/handlers/IntegratedHandler.ts`
- `backend/modules/assignment-engine/handlers/SignHandler.ts`

---

## 三、是否修改正式任务接口

**否。**

`backend/api/routes.ts` 未修改（修改时间 2026-06-26 22:16，早于 Phase 2-C）。

---

## 四、是否修改 bnsy-operator/

**否。**

Phase 2-C 期间未对 `bnsy-operator/` 目录做任何读写操作。所有审计工作均限于 `bnsy-operator-next/` 目录内。

---

## 五、正式任务链路调用图

完整调用链如下（详见 [审计文档第一节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)）：

```text
HTTP POST /api/sign
  ↓
backend/api/routes.ts (sign 路由 L1096-L1167)
  ├─ 校验请求体 + 解析 assignments
  ├─ createTask(...)                # 写入 DB（pending）
  └─ void engine.execute({...})     # fire-and-forget
       ↓
AssignmentEngine.execute() L263-L685
  └─ 并发调度 executeAssignment() × N  (L700-L833)
       ├─ L715: pool.getStaffConnection(staffName, site)
       │     → 遍历 BrowserPool.connections 找匹配 staff
       │     → 三道过滤：is_connected + p0Verified + page.evaluate(liveness)
       │     → 返回 { page, browser, windowId, windowInfo, staffName }
       │
       ├─ L743: pool.acquireWindowLease({ windowId, taskId, staffName, taskType })
       │     → 原子四步：lockManager.acquire + windowBusy.set + activeWindowLeases.set + refreshRuntimeState
       │     → 返回 WindowLeaseHandle { release, renew }
       │
       ├─ L752: pool.ensureWindowReady(windowId)   # P0 前置检查（锁内）
       ├─ L758: setInterval(() => lease.renew(), 60_000)  # busy 续租
       ├─ L763: 构建 WorkerContext { staffName, windowId, page, log }
       ├─ L775: Promise.race([handler.executeWorker, timeout, abort])
       └─ finally L790: lease.release()  # 原子释放 L1+L2+L3
```

**关键发现**：
- page 来源：`BrowserPool.connections.get(windowId).page` → 底层 `chromium.connectOverCDP()`
- Handler 只依赖 `ctx.page`，**不直接依赖 BrowserPool/EasyBR**
- 三层并行状态（L1 lock + L2 busy + L3 lease）由 `acquireWindowLease`/`releaseWindowLease` 原子同步

---

## 六、BrowserPool 依赖清单

基于 9 个关键词全项目搜索，分类如下（详见 [审计文档第二节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)）：

### A. 正式任务执行依赖（核心，不可动）
- AssignmentEngine 调用 `getStaffConnection` / `acquireWindowLease` / `ensureWindowReady` / `lease.release` / `lease.renew`
- 4 个正式 Handler 仅依赖 `ctx.page`，**不直接依赖 BrowserPool**

### B. 窗口初始化依赖（启动路径）
- BrowserPool 内部 4 处 `connectOverCDP`（L557, L585, L611, L687）
- BrowserPool 内部 9 处 `EasyBRClient`（L233, L348, L517, L575, L1169, L1663, L1852, L1949, L1974）
- `checkAndAutoLogin` 私有方法（L969-L1077）

### C. Header 状态查询依赖（routes.ts 违反封装）⚠️
- routes.ts 通过 `pool as any` 直接访问 `p0Verified` / `windowBusy` / `connections` / `checkLiveness` 私有成员

### D. POC / legacy 依赖（可废弃）
- scripts/check-sign-dom.ts、scripts/sync-easybr-windows.ts、scripts/diagnose-cdp.ts
- backend/browser/runtime/HealthMonitor.ts、ReconnectPolicy.ts
- backend/index.ts L354 调用 `markWindowIdle`（BusyWatchdog 兜底）

### E. 可废弃依赖
- `getAdminConnection` — **已完全废弃，无任何调用**
- `markWindowBusy` — 已被 lease 模式替代

### 依赖收敛结论
**BrowserPool 核心契约收敛到 3 个方法**：`getStaffConnection` + `acquireWindowLease` + `ensureWindowReady`。Handler 不直接依赖 BrowserPool，是接入 Adapter 的关键切入点。

---

## 七、WindowLockManager 调用链

详见 [审计文档第三节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

### 锁关键属性
| 属性 | 值 |
|------|-----|
| 锁粒度 | `windowId`（非 staffName） |
| 锁模式 | 抢占式（不排队，失败抛 WindowBusyError） |
| release 幂等性 | ✅ 重复释放静默返回 |
| taskId 校验 | 可选，不匹配静默跳过 |
| 持久性 | 纯内存锁，进程重启即清空 |
| 超时检测 | `getOverdueLocks` 仅监控，不自动释放 |

### acquire / release 调用链
```text
acquire: Engine L743 → pool.acquireWindowLease L1527
         → lockManager.acquire (L1) + windowBusy.set (L2) + activeWindowLeases.set (L3)
         → refreshRuntimeState

release: Engine finally L795 → lease.release()
         → pool.releaseWindowLease L1575
         → 校验 taskId → delete L3 + delete L2 + lockManager.release (L1)
         → refreshRuntimeState
```

### 异常路径 release 分析
- Handler 正常完成 / 抛错 / 硬超时 / AbortSignal 取消 → ✅ finally 都执行 lease.release()
- 进程崩溃 → ❌ 内存锁丢失，重启即清空
- lease.taskId 不匹配 → ⚠️ 静默跳过

### lock 与 windowBusy / adapter.markBusy 关系
- L1 WindowLockManager.locks（互斥锁）
- L2 BrowserPool.windowBusy（busy 时间戳）
- L3 BrowserPool.activeWindowLeases（lease 元数据）
- adapter.markBusy（Playwright 侧独立状态机，**当前与 L1/L2/L3 完全独立**）

**冲突风险**：若 Engine 仍走 acquireWindowLease 同时 Adapter 又调 markBusy，会出现双状态机并行。协调策略见第十二节。

---

## 八、EasyBR 强依赖点

详见 [审计文档第五节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

| 依赖点 | 文件 | 位置 | 性质 |
|--------|------|------|------|
| `connectOverCDP()` | BrowserPool.ts | L557, L585, L611, L687（4 处） | **核心强依赖** |
| `EasyBRClient` | BrowserPool.ts | L233, L348, L517, L575, L1169, L1663, L1852, L1949, L1974（9 处） | **核心强依赖** |
| `connectOverCDP()` | scripts/check-sign-dom.ts | 1 处 | legacy 诊断脚本 |
| `connectOverCDP()` | scripts/diagnose-cdp.ts | 1 处 | legacy 诊断脚本 |
| `EasyBRClient` | scripts/sync-easybr-windows.ts | 1 处 | legacy 同步脚本 |

**强依赖结论**：EasyBR 强依赖**全部集中在 BrowserPool 内部**。正式任务链路（Engine + 4 个 Handler）不直接依赖 EasyBR。只要替换 BrowserPool 的连接获取方式，即可解除 EasyBR 强依赖。

---

## 九、PlaywrightWindowAdapter 可替换点

详见 [审计文档第六节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

### Adapter 已实现接口
- `ensureWindowReady(options)` — 替代 BrowserPool 初始化
- `getWorkerPage(options)` — 替代 getStaffConnection 的 page 获取
- `markBusy(runtimeKey)` — 替代 windowBusy.set
- `markReady(runtimeKey)` — 替代 windowBusy.delete
- `refreshStatus(options)` — 替代 refreshRuntimeState
- `closeWindow(options)` — 替代 BrowserPool.close

### 可替换点与不可替换点
| 位置 | 可否替换 |
|------|----------|
| BrowserPool.getStaffConnection 的 page 来源 | ✅ 可替换 |
| BrowserPool.acquireWindowLease 的 busy 标记 | ⚠️ 部分可替换（lock 仍需 WindowLockManager） |
| BrowserPool.ensureWindowReady 的 P0 检查 | ✅ 可替换 |
| BrowserPool 内部 connectOverCDP | ✅ 可替换 |
| WindowLockManager | ❌ **不可替换**（Adapter 无锁能力） |
| routes.ts 的 `(pool as any).p0Verified` | ⚠️ 需单独处理 |

**关键结论**：Adapter 不能完全替代 BrowserPool，需与 WindowLockManager **组合使用**，由 Engine 层统一调度。

---

## 十、方案 A / 方案 B 对比

详见 [审计文档第七、八节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

| 维度 | 方案 A（Handler 层接入） | 方案 B（Engine 层接入） |
|------|--------------------------|--------------------------|
| Handler 改动 | ❌ 每个 Handler 都要改 | ✅ Handler 完全不修改 |
| 状态机冲突 | ❌ Engine lease + Handler markBusy 双状态机并行 | ✅ Engine 统一管理 lock + busy |
| 异常恢复责任 | ❌ 分散到每个 Handler | ✅ 集中在 Engine finally |
| WorkerContext 结构 | ❌ 需新增 options/runtimeKey 字段 | ✅ 保持不变（可选新增） |
| 符合 Phase 2-C 原则 | ❌ 违反"不直接改 Handler" | ✅ 完全符合 |
| 回退成本 | ⚠️ 需回滚单个 Handler | ✅ 切换 mode 即可回退 |
| Engine 改动风险 | ✅ Engine 不改 | ⚠️ Engine 改动敏感（但有 mode 保护） |

---

## 十一、推荐接入层级

**推荐方案 B（Engine 层接入）。**

理由：
1. **Handler 零改动**：方案 B 完全不修改 4 个正式 Handler，符合 Phase 2-C 禁止事项
2. **避免双状态机冲突**：Engine 统一管理 lock + busy，不会出现状态不一致
3. **责任收敛**：Engine 本就负责窗口获取和释放，方案 B 只是在同一位置新增 runtime mode 切换
4. **回退成本低**：模式开关切换到 `legacy_easybr` 即可完全回退
5. **符合 Phase 2-C 原则**：不直接改任何真实业务 Handler

### 接入位置
```text
AssignmentEngine.executeAssignment() L700-L833
  ↓
新增私有方法：resolveWorkerConnection(pool, adapter, staffName, site, runtimeMode)
  - legacy_easybr: 走原路径（getStaffConnection + acquireWindowLease）
  - playwright:    走新路径（adapter.ensureWindowReady + lockManager.acquire + adapter.markBusy）
  ↓
返回统一的 WorkerConnectionHandle { page, windowId, release, renew }
```

### 关键设计约束
1. 不修改原有 acquireWindowLease 逻辑
2. 新增路径独立函数，便于测试和回退
3. 统一返回 Handle 接口，Engine 后续逻辑无感知
4. 模式判断集中一处（仅在 resolveWorkerConnection 内部）

---

## 十二、WINDOW_RUNTIME_MODE 设计

详见 [审计文档第十节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

### 配置定义
```env
WINDOW_RUNTIME_MODE=legacy_easybr   # 默认值
# 可选值：
#   legacy_easybr  — 走 BrowserPool + EasyBR + connectOverCDP（默认）
#   playwright     — 走 PlaywrightWindowAdapter + launchPersistentContext
```

### 设计要求
| 要求 | 实现 |
|------|------|
| 不影响当前 POC API | ✅ POC API 独立路由，不受 mode 影响 |
| 正式任务默认走 legacy_easybr | ✅ 默认值 `legacy_easybr` |
| 仅 `playwright` 时走 Adapter | ✅ 严格匹配字符串 |
| 模式判断集中一处 | ✅ 仅在 `resolveWorkerConnection` 内判断 |
| 日志必须输出 runtime mode | ✅ Engine 启动时 + 每次 executeAssignment 都记录 |

### 配置读取函数（Phase 2-D 实现）
```typescript
// backend/config/runtimeMode.ts（Phase 2-D 新增，本阶段仅设计）
export type WindowRuntimeMode = 'legacy_easybr' | 'playwright';

export function getRuntimeMode(): WindowRuntimeMode {
  const raw = process.env.WINDOW_RUNTIME_MODE;
  if (raw === 'playwright') return 'playwright';
  return 'legacy_easybr';  // 默认值，包含未设置和非法值
}
```

### 模式切换行为对照
| 行为 | legacy_easybr | playwright |
|------|---------------|------------|
| 窗口连接获取 | `pool.getStaffConnection()` | `adapter.getWorkerPage()` |
| 锁获取 | `pool.acquireWindowLease()` | `lockManager.acquire()` + `adapter.markBusy()` |
| P0 前置检查 | `pool.ensureWindowReady()` | `adapter.ensureWindowReady()` |
| 锁释放 | `lease.release()` | `adapter.markReady()` + `lockManager.release()` |
| Handler 行为 | 不变 | 不变 |

---

## 十三、WorkerContext 设计

详见 [审计文档第十一节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

### 当前结构
```typescript
export interface WorkerContext {
  staffName: string;
  windowId: string;
  page: Page;
  log: LogFn;
}
```

### 目标结构（Phase 2-D 实现，本阶段仅设计）
```typescript
export interface WorkerContext {
  staffName: string;
  windowId: string;
  page: Page;          // ← 保持不变，Handler 无感知
  log: LogFn;
  // 新增字段（可选，向后兼容）
  runtimeKey?: string;                                    // 用于日志诊断
  runtimeMode?: 'legacy_easybr' | 'playwright';           // 用于调试和回滚
}
```

### 设计原则
1. **Handler 尽量继续拿 page 操作**：page 字段保持不变
2. **Handler 不直接关心 EasyBR / Playwright**：Handler 只用 page，不感知 runtime mode
3. **runtimeKey 用于日志**：不参与业务逻辑判断
4. **runtimeMode 用于调试和回滚**：可选字段
5. **向后兼容**：新增字段全部可选，legacy 路径可不填

### 与现有类型的兼容性
| 现有类型 | 兼容性 |
|----------|--------|
| WorkerContext | ✅ 向后兼容（新增可选字段） |
| TaskContext | ✅ 不变 |
| Assignment | ✅ 不变 |
| TaskHandler.executeWorker | ✅ 签名不变 |
| LogFn | ✅ 不变 |

---

## 十四、busy / lock 协调策略

详见 [审计文档第十二节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

### 八个核心问题的回答

| # | 问题 | 答案 |
|---|------|------|
| Q1 | WindowLockManager 继续保留还是替换？ | **保留**。Adapter 无锁能力，两条路径都复用 WindowLockManager |
| Q2 | adapter.markBusy 是否替代 windowBusy？ | **playwright 模式下替代，legacy 模式下不变**。两条路径互斥，不会双状态机并行 |
| Q3 | acquire lock 和 adapter.markBusy 的先后顺序？ | **先 acquire lock，后 markBusy**。lock 失败应立即返回，不应触发 markBusy |
| Q4 | markReady 和 release lock 的先后顺序？ | **先 markReady，后 release lock**。窗口状态恢复应在锁内完成 |
| Q5 | 任务异常时如何恢复 ready？ | **finally 块强制 markReady**。无论成功/失败/超时/取消都执行 |
| Q6 | markBusy 成功但 Handler 抛错，如何 markReady？ | **finally 块兜底**。markReady 异常仅记录日志，不掩盖原始错误 |
| Q7 | 浏览器已关闭，如何处理？ | **ensureWindowReady 阶段检测并重启**。adapter 已实现 closed/failed 自动 launchWindow |
| Q8 | status=login_required，任务如何结束？ | **任务返回 failed，释放锁，不调 markBusy**。窗口本来就不是 busy |

### 统一协调流程（playwright 模式）
```text
任务开始：
  1. adapter.ensureWindowReady(options)
     → login_required → fail, return
     → busy → fail, return
     → ready → 继续
  2. lockManager.acquire(windowId, taskId)
     → 失败 → fail, return
  3. adapter.markBusy(runtimeKey)
     → 失败 → release lock, fail, return
  4. 构建 WorkerContext { page, windowId, runtimeKey, runtimeMode }
  5. handler.executeWorker(ctx, ...)

任务结束（finally）：
  1. adapter.markReady(runtimeKey)              ← 先恢复窗口
  2. lockManager.release(windowId, taskId)      ← 再释放锁
  3. clearInterval(busyRenewalTimer)
```

### 不变量（Invariant）
| 不变量 | 说明 |
|--------|------|
| lock 持有期间，窗口必为 busy | acquire 后立即 markBusy，release 前必 markReady |
| Handler 执行期间，lock 必持有 | lock 在 Handler 调用前 acquire，Handler 返回后 release |
| Handler 执行期间，windowId 不变 | 同一 windowId 的 page 注入 WorkerContext |
| markReady 失败不影响 release lock | 两者独立，互不阻塞 |

---

## 十五、异常恢复策略

详见 [审计文档第十三节](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md)。

| 场景 | 触发位置 | 恢复策略 | 责任方 |
|------|----------|----------|--------|
| 窗口未登录 | ensureWindowReady | 任务返回 failed（login_required），不调 markBusy | Engine |
| 窗口已关闭 | ensureWindowReady | adapter 自动 launchWindow 重启；重启后 login_required 则 fail | adapter + Engine |
| 窗口被占用 | lockManager.acquire | 抛 WindowBusyError，任务返回 failed（busy） | Engine |
| markBusy 失败 | adapter.markBusy | 释放 lock，任务返回 failed | Engine |
| Handler 抛错 | executeWorker | finally 强制 markReady + release lock | Engine |
| 硬超时 | Promise.race | timeout 触发，finally 强制 markReady + release lock | Engine |
| AbortSignal 取消 | Promise.race | abort 触发，finally 强制 markReady + release lock | Engine |
| markReady 失败 | finally | 仅记录日志，不掩盖原始错误；release lock 仍执行 | Engine |
| release lock 失败 | finally | 仅记录日志（lockManager.release 幂等） | Engine |
| 进程崩溃 | — | 内存锁丢失，重启即清空；adapter 状态由 ensureWindowReady 重置 | 重启恢复 |

### 关键设计约束
1. **markReady 在 finally 中执行**：无论成功/失败/超时/取消，都尝试恢复窗口 ready
2. **markReady 异常仅记录日志**：不抛出，避免掩盖 Handler 的原始错误
3. **release lock 在 markReady 之后**：确保窗口状态恢复在锁内完成
4. **lease 模式（legacy）保持不变**：原有 acquireWindowLease/releaseWindowLease 逻辑完全不动

---

## 十六、是否建议进入 Phase 2-D

**建议进入 Phase 2-D。**

### Phase 2-C 通过标准核对

| # | 通过标准 | 状态 |
|---|----------|------|
| 1 | 没有直接修改真实业务 Handler 执行逻辑 | ✅ |
| 2 | 没有改变正式任务运行行为 | ✅ |
| 3 | 已完整梳理 BrowserPool 依赖 | ✅ |
| 4 | 已完整梳理 WindowLockManager 与 busy 关系 | ✅ |
| 5 | 已明确 adapter 应接入 Engine 层还是 Handler 层 | ✅ 推荐方案 B（Engine 层） |
| 6 | 已设计 WINDOW_RUNTIME_MODE | ✅ 默认 legacy_easybr |
| 7 | 已设计 WorkerContext 兼容结构 | ✅ 新增可选字段，向后兼容 |
| 8 | 已设计 busy / lock 协调策略 | ✅ 8 个核心问题全部回答 |
| 9 | 已输出下一阶段 Phase 2-D 可执行方案 | ✅ 见下方 |
| 10 | 未影响 bnsy-operator/ 生产项目 | ✅ |

### Phase 2-D 建议实施范围

**仅接入 SignHandler**（不改 Handler 代码，仅切换 mode）：
1. SignHandler 是最简单的 Handler（仅调用 executeSign）
2. SignHandler 的 ctx.page 使用模式最直接
3. SignHandler 已有 Phase 2-B 的 AdapterTestHandler 作为参考
4. 单 Handler 接入风险可控

### Phase 2-D 实施步骤

```text
Step 1: 新增配置读取
  - 新增 backend/config/runtimeMode.ts
  - 导出 getRuntimeMode() / isPlaywrightMode()
  - 不修改任何现有配置

Step 2: 新增 WorkerConnectionHandle 抽象
  - 新增类型：WorkerConnectionHandle { page, windowId, release, renew }
  - 不修改 WorkerContext

Step 3: 新增 Engine 私有方法
  - resolveWorkerConnection(staffName, site, taskId, ...)
    - legacy: 调用 pool.getStaffConnection + pool.acquireWindowLease
    - playwright: 调用 adapter.ensureWindowReady + lockManager.acquire + adapter.markBusy
  - 不修改原有 executeAssignment 主体逻辑（仅替换 conn + lease 获取方式）

Step 4: 切换 SignHandler 任务路由
  - 在 routes.ts 的 sign 路由中，读取 WINDOW_RUNTIME_MODE
  - 如果 playwright，传递 adapter 给 Engine
  - 如果 legacy，保持原样

Step 5: 端到端验证
  - WINDOW_RUNTIME_MODE=legacy_easybr：SignHandler 任务正常（回归测试）
  - WINDOW_RUNTIME_MODE=playwright：SignHandler 任务成功
  - 验证 markBusy/markReady 日志
  - 验证 lock acquire/release
  - 验证异常恢复（Handler 抛错后窗口 ready）
```

### Phase 2-D 验收检查清单
- [ ] `WINDOW_RUNTIME_MODE=legacy_easybr` 时，所有正式任务行为不变
- [ ] `WINDOW_RUNTIME_MODE=playwright` 时，SignHandler 任务可真实执行
- [ ] 4 个正式 Handler 文件零修改
- [ ] routes.ts 仅新增 mode 读取，原有逻辑不变
- [ ] bnsy-operator/ 零修改
- [ ] 日志明确输出 runtime mode
- [ ] markBusy/markReady 在 playwright 模式下正确执行
- [ ] 异常路径（Handler 抛错）窗口恢复 ready
- [ ] 窗口复用（第二次任务 launched=false）

---

## 附录：相关文档

| 文档 | 说明 |
|------|------|
| [phase-2c-runtime-integration-audit.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2c-runtime-integration-audit.md) | Phase 2-C 审计文档（15 项内容） |
| [phase-2b-supplementary-report.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2b-supplementary-report.md) | Phase 2-B 补充验收报告 |
| [phase-2b-adapter-task-report.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2b-adapter-task-report.md) | Phase 2-B 验收报告 |
| [phase-2a-window-adapter-report.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2a-window-adapter-report.md) | Phase 2-A 验收报告 |
| [window-adapter-design.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/window-adapter-design.md) | Phase 2-A Adapter 设计 |

---

> Phase 2-C 验收完成。建议进入 Phase 2-D：选择 SignHandler 作为首个真实业务 Handler 小范围接入 PlaywrightWindowAdapter。
