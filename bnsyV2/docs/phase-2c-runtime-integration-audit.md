# Phase 2-C 审计报告：真实任务链路接入前审计与 Adapter 模式开关设计

> 阶段：DaoPai Next Phase 2-C
> 范围：审计现有正式任务链路，设计 PlaywrightWindowAdapter 的渐进接入方案和模式开关
> 原则：只审计和设计，不直接改正式任务行为；不修改任何真实业务 Handler
> 输出日期：2026-06-27

---

## 〇、隔离边界声明

本审计文档基于以下隔离边界：

| 边界 | 状态 |
|------|------|
| 仅操作 `bnsy-operator-next/` | ✅ |
| 严禁修改 `bnsy-operator/` 生产项目 | ✅ |
| 严禁 `import ../bnsy-operator/` 任何文件 | ✅ |
| 不使用生产端口 3100 / 5175 | ✅ |
| 不连接生产数据库 | ✅ |
| 不读取生产 settings.json | ✅ |
| 不操作生产 EasyBR 窗口 | ✅ |
| 不直接修改 SignHandler / ArrivalHandler / DispatchHandler / IntegratedHandler 执行逻辑 | ✅ |
| 不修改 `backend/api/routes.ts` 正式任务路由 | ✅ |
| 不删除 BrowserPool / easybr/ | ✅ |

本阶段**仅新增审计文档**，**不改变任何正式任务运行行为**。

---

## 一、当前正式任务链路调用图

### 1.1 完整调用链

```text
HTTP POST /api/sign (或其他任务路由)
  ↓
backend/api/routes.ts
  ├─ 校验请求体 + 解析 assignments
  ├─ createTask(...)                # 写入 DB（pending）
  └─ void engine.execute({...})     # fire-and-forget，立即返回 202
       ↓
backend/modules/assignment-engine/AssignmentEngine.ts
  └─ execute() L263-L685
       ├─ 1. 加载 taskContext（site / dryRunMode / taskType）
       ├─ 2. 写入 taskLog（启动）
       ├─ 3. 并发调度：executeAssignment(assignment, ...) × N  ↓
       │      └─ L700-L833
       │           ├─ L715: pool.getStaffConnection(staffName, site)
       │           │     → 遍历 BrowserPool.connections 找匹配 staff
       │           │     → 三道过滤：is_connected + p0Verified + page.evaluate(liveness)
       │           │     → 返回 { page, browser, windowId, windowInfo, staffName }
       │           │
       │           ├─ L738-L743: pool.acquireWindowLease({ windowId, taskId, staffName, taskType })
       │           │     → 原子四步：
       │           │       1. lockManager.acquire(windowId, taskId)   # L1 WindowLockManager
       │           │       2. windowBusy.set(windowId, now)            # L2 busy 时间戳
       │           │       3. activeWindowLeases.set(windowId, lease)  # L3 lease 元数据
       │           │       4. refreshRuntimeState(windowId)
       │           │     → 返回 WindowLeaseHandle { release, renew }
       │           │
       │           ├─ L752: pool.ensureWindowReady(windowId)
       │           │     → P0 前置检查（锁内执行，避免并发 DOM 操作竞态）
       │           │       - 清理多余 tab
       │           │       - 清除弹窗
       │           │       - 确保侧边栏展开
       │           │
       │           ├─ L758-L760: 启动 busy 续租定时器
       │           │     setInterval(() => lease.renew(), 60_000)
       │           │
       │           ├─ L763-L768: 构建 WorkerContext
       │           │     { staffName, windowId, page: conn.page, log: staffLog }
       │           │
       │           ├─ L774-L779: Promise.race 竞速执行
       │           │     - handler.executeWorker(workerCtx, assignment, taskContext, onProgress)
       │           │     - createTimeoutPromise(timeoutMs)   # 硬超时
       │           │     - createAbortPromise(signal)         # AbortController
       │           │
       │           └─ finally L790-L797:
       │                 - clearInterval(busyRenewalTimer)
       │                 - timeoutHandle.clear()
       │                 - lease.release()                    # 原子释放 L1+L2+L3
       │
       └─ 4. finalizeTask() L842-L914
              → 写入终态（DB + PG + log + flush + Metrics + TASK_FINISHED）
```

### 1.2 关键文件位置

| 文件 | 关键行 | 说明 |
|------|--------|------|
| [routes.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/api/routes.ts) | sign 路由 L1096-L1167 | HTTP 入口 |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts) | execute L263-L685 | 主入口 |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L700-L833) | executeAssignment L700-L833 | 单 Assignment 执行 |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L842-L914) | finalizeTask L842-L914 | 终态写入 |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts) | L1527-L1573 | acquireWindowLease |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts) | L1575-L1608 | releaseWindowLease |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts) | L1117-L1148 | getStaffConnection |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts) | L1098-L1111 | ensureWindowReady |
| [WindowLockManager.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/WindowLockManager.ts) | L84-L100 | acquire |
| [WindowLockManager.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/WindowLockManager.ts) | L111-L130 | release |
| [types.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/types.ts) | L29-L35 | WorkerContext |

### 1.3 三层并行状态同步模型

`acquireWindowLease` 原子同步三层状态：

```text
L1 WindowLockManager.locks        # 互斥锁（windowId → WindowLock）
L2 BrowserPool.windowBusy         # busy 时间戳（windowId → timestamp）
L3 BrowserPool.activeWindowLeases # lease 元数据（windowId → WindowLease）
   ↓
   refreshRuntimeState(windowId) → 计算 status
```

任一层失败都会触发回滚（见 [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts#L1538-L1560) L1538-L1560）。

### 1.4 WorkerContext 当前结构

```typescript
// backend/modules/assignment-engine/types.ts L29-L35
export interface WorkerContext {
  staffName: string;
  windowId: string;
  page: Page;
  log: LogFn;
}
```

`page` 直接来自 `BrowserPool.connections.get(windowId).page`，**底层强耦合 EasyBR connectOverCDP**。

---

## 二、BrowserPool 依赖清单

基于全项目搜索 `BrowserPool` / `getStaffConnection` / `getAdminConnection` / `checkAndAutoLogin` / `verifyReady` / `windowBusy` / `p0Verified` / `EasyBRClient` / `connectOverCDP` 共 9 个关键词，分类如下：

### A. 正式任务执行依赖（核心，不可动）

| 调用方 | 调用方法 | 位置 | 说明 |
|--------|----------|------|------|
| AssignmentEngine | `pool.getStaffConnection()` | L715 | 获取 staff 窗口连接 |
| AssignmentEngine | `pool.acquireWindowLease()` | L743 | 原子取锁+标记 busy |
| AssignmentEngine | `pool.ensureWindowReady()` | L752 | P0 前置检查 |
| AssignmentEngine | `lease.release()` / `lease.renew()` | L759, L795 | 释放/续租 lease |
| SignHandler | `ctx.page` | executeWorker L22 | Handler 只用 page，不直接调 pool |
| ArrivalHandler | `ctx.page` | executeWorker | 同上 |
| DispatchHandler | `ctx.page` | executeWorker | 同上 |
| IntegratedHandler | `ctx.page` | executeWorker | 同上 |

**关键洞察**：Handler **不直接依赖 BrowserPool**，只依赖 `ctx.page`。这是接入 Adapter 的关键切入点。

### B. 窗口初始化依赖（启动路径）

| 调用方 | 调用方法 | 位置 | 说明 |
|--------|----------|------|------|
| BrowserPool | `connectOverCDP()` | L557, L585, L611, L687 | EasyBR CDP 连接（4 处） |
| BrowserPool | `EasyBRClient` | L233, L348, L517, L575, L1169, L1663, L1852, L1949, L1974 | EasyBR HTTP API（9 处） |
| BrowserPool | `checkAndAutoLogin()` | L969-L1077（私有） | 自动登录，仅初始化路径 |
| backend/index.ts | `pool.initialize()` | 启动时 | 启动时初始化连接池 |

### C. Header 状态查询依赖（routes.ts 违反封装）

| 调用方 | 调用方法 | 位置 | 说明 |
|--------|----------|------|------|
| routes.ts | `(pool as any).p0Verified` | L112 | 直接访问私有字段 ⚠️ |
| routes.ts | `(pool as any).windowBusy` | routes.ts 内 | 直接访问私有字段 ⚠️ |
| routes.ts | `(pool as any).connections` | routes.ts 内 | 直接访问私有字段 ⚠️ |
| routes.ts | `(pool as any).checkLiveness()` | routes.ts 内 | 直接访问私有方法 ⚠️ |

**风险点**：routes.ts 通过 `pool as any` 绕过类型系统直接访问 BrowserPool 私有字段，违反封装。Adapter 接入时这些位置需要单独处理。

### D. POC / legacy 依赖（可废弃）

| 调用方 | 调用方法 | 位置 | 说明 |
|--------|----------|------|------|
| scripts/check-sign-dom.ts | `connectOverCDP()` | 1 处 | legacy 诊断脚本 |
| scripts/sync-easybr-windows.ts | `EasyBRClient` | 1 处 | legacy 同步脚本 |
| scripts/diagnose-cdp.ts | `connectOverCDP()` | 1 处 | legacy 诊断脚本 |
| backend/browser/runtime/HealthMonitor.ts | `BrowserPool` | 监控 | 健康监控 |
| backend/browser/runtime/ReconnectPolicy.ts | `BrowserPool` | 重连策略 | 重连监控 |
| backend/index.ts L354 | `pool.markWindowIdle()` | BusyWatchdog | 旧接口仅此一处外部调用 |

### E. 可废弃依赖

| 调用方 | 调用方法 | 位置 | 说明 |
|--------|----------|------|------|
| — | `pool.getAdminConnection()` | 全项目 | **已完全废弃，无任何调用** |
| — | `pool.markWindowBusy()` | 全项目 | 已被 lease 模式替代，外部仅 index.ts:354 调用 markWindowIdle（watchdog 兜底） |

### 2.1 依赖收敛结论

**BrowserPool 核心契约收敛到 3 个方法**：
1. `getStaffConnection(staffName, site)` — 获取连接
2. `acquireWindowLease({ windowId, taskId, ... })` — 取锁+标记 busy
3. `ensureWindowReady(windowId)` — P0 前置检查

**Handler 不直接依赖 BrowserPool**，只依赖 `ctx.page`。这是接入 Adapter 的关键切入点。

---

## 三、WindowLockManager 调用链

### 3.1 锁实现概览

```typescript
// backend/browser/WindowLockManager.ts
export class WindowLockManager {
  private locks = new Map<string, WindowLock>();  // L63

  async acquire(windowId: string, taskId: string): Promise<void> {
    const existing = this.locks.get(windowId);
    if (existing) throw new WindowBusyError(windowId, existing.taskId);  // 抢占式
    this.locks.set(windowId, { windowId, taskId, acquiredAt: Date.now() });
  }

  release(windowId: string, taskId?: string): void {
    const existing = this.locks.get(windowId);
    if (!existing) return;                          // 幂等
    if (taskId !== undefined && existing.taskId !== taskId) return;  // taskId 校验
    this.locks.delete(windowId);
  }
}
```

### 3.2 锁关键属性

| 属性 | 值 |
|------|-----|
| 锁粒度 | `windowId`（**非 staffName**，避免同名/映射变化问题） |
| 锁模式 | 抢占式（acquire 失败立即抛 WindowBusyError，**不排队**） |
| release 幂等性 | ✅ 重复释放静默返回 |
| taskId 校验 | 可选，不匹配时静默跳过 |
| 持久性 | 纯内存锁，进程重启即清空 |
| 超时检测 | `getOverdueLocks()` **仅监控，不自动释放** |

### 3.3 acquire / release 调用链

```text
acquire 路径：
  AssignmentEngine.executeAssignment L743
    → pool.acquireWindowLease({ windowId, taskId, staffName, taskType })
      → BrowserPool.acquireWindowLease L1527
        → lockManager.acquire(windowId, taskId)   # ← L1 锁
        → windowBusy.set(windowId, now)            # ← L2 busy
        → activeWindowLeases.set(windowId, lease)  # ← L3 lease
        → refreshRuntimeState(windowId)
      ← 返回 WindowLeaseHandle { release, renew }

release 路径：
  AssignmentEngine.executeAssignment finally L795
    → lease.release()
      → BrowserPool.releaseWindowLease L1575
        → 校验 lease.taskId === taskId（不匹配静默跳过）
        → activeWindowLeases.delete(windowId)      # ← L3 lease
        → windowBusy.delete(windowId)              # ← L2 busy
        → lockManager.release(windowId, taskId)    # ← L1 锁
        → refreshRuntimeState(windowId)
```

### 3.4 异常路径 release 分析

| 场景 | release 是否执行 | 说明 |
|------|------------------|------|
| Handler 正常完成 | ✅ finally 执行 | lease.release() |
| Handler 抛错 | ✅ finally 执行 | try/catch/finally 完整 |
| 硬超时触发 | ✅ finally 执行 | Promise.race 不会跳过 finally |
| AbortSignal 取消 | ✅ finally 执行 | 同上 |
| 进程崩溃 | ❌ 内存锁丢失 | 重启即清空，符合崩溃恢复需求 |
| lease.taskId 不匹配 | ⚠️ 静默跳过 | 仅记录日志，不报错 |

### 3.5 风险点

1. **`getOverdueLocks` 不自动释放**：长期未释放的锁需要运维介入。建议 Adapter 接入后保留此监控。
2. **acquireWindowLease 内部失败回滚**：[BrowserPool.ts L1538-L1560](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts#L1538-L1560) 已实现回滚（leaseSet 标志位），但若 `lockManager.acquire` 成功后立即进程崩溃，锁会残留至重启。
3. **routes.ts 直接访问 `windowBusy`**：违反封装，Adapter 接入时需要提供等价的状态查询接口。

### 3.6 lock 与 windowBusy / adapter.markBusy 关系

| 状态层 | 实现位置 | 作用 | 与其他层关系 |
|--------|----------|------|--------------|
| L1 WindowLockManager.locks | WindowLockManager.ts | 互斥锁，防止并发 acquire | acquire 失败抛 WindowBusyError |
| L2 BrowserPool.windowBusy | BrowserPool.ts L1499 | busy 时间戳，用于 refreshRuntimeState | 与 L1 原子同步 |
| L3 BrowserPool.activeWindowLeases | BrowserPool.ts L1549 | lease 元数据（taskId/staffName/taskType） | 与 L1/L2 原子同步 |
| **adapter.markBusy** | PlaywrightWindowAdapter.ts | Playwright 侧 busy 标记（独立状态机） | **当前与 L1/L2/L3 完全独立** |

**关键冲突风险**：若 Adapter 接入后，Engine 仍走 `acquireWindowLease`（L1+L2+L3），同时 Adapter 又调用 `markBusy`（独立状态机），会出现**双状态机并行**，可能导致：
- Engine 释放 lease 后，Adapter 状态仍为 busy
- Adapter markReady 后，Engine 仍持有 lock

**协调策略见第 12 节**。

---

## 四、Handler 获取 page 的方式

### 4.1 当前获取方式

Handler **不直接获取 page**，由 Engine 注入：

```typescript
// AssignmentEngine.executeAssignment L763-L768
const workerCtx: WorkerContext = {
  staffName,
  windowId: conn.windowId,
  page: conn.page,   // ← 来自 BrowserPool.getStaffConnection 返回的 conn
  log: staffLog,
};

await handler.executeWorker(workerCtx, assignment, taskContext, onProgress);
```

### 4.2 page 来源追溯

```text
workerCtx.page
  ← conn.page (AssignmentEngine L766)
  ← pool.getStaffConnection(staffName, site).page (L715)
  ← BrowserPool.connections.get(windowId).page (BrowserPool 内部)
  ← EasyBRClient → chromium.connectOverCDP(cdpUrl) (初始化时)
```

**结论**：page 底层来自 `chromium.connectOverCDP()`，**强耦合 EasyBR 指纹浏览器**。

### 4.3 Handler 使用 page 的模式

以 SignHandler 为例：

```typescript
// backend/modules/assignment-engine/handlers/SignHandler.ts L22-L40
export class SignHandler implements TaskHandler {
  async executeWorker(ctx: WorkerContext, ...): Promise<TaskResult> {
    const results = await executeSign(
      ctx.page,           // ← Handler 只用 page，不关心来源
      assignment,
      ctx.log,
      taskContext.taskId,
      taskContext.dryRunMode,
    );
    onProgress(results.length, results);
    return { success, processed, failed };
  }
}
```

**关键洞察**：所有 4 个正式 Handler 都只依赖 `ctx.page`，**不依赖 BrowserPool/EasyBR/connectOverCDP**。这意味着：
- 只要 WorkerContext.page 的来源可以切换，Handler 无需修改
- Adapter 接入点应选在 **Engine 构建 WorkerContext 的位置**，而非 Handler 内部

---

## 五、EasyBR 强依赖点

### 5.1 强依赖点清单

| 依赖点 | 文件 | 位置 | 性质 |
|--------|------|------|------|
| `connectOverCDP()` | BrowserPool.ts | L557, L585, L611, L687 | **核心强依赖**：CDP 连接 EasyBR 窗口 |
| `EasyBRClient` | BrowserPool.ts | L233, L348, L517, L575, L1169, L1663, L1852, L1949, L1974 | **核心强依赖**：EasyBR HTTP API（窗口列表、关闭、状态） |
| `EasyBRClient` | scripts/sync-easybr-windows.ts | 1 处 | legacy 脚本，可废弃 |
| `connectOverCDP()` | scripts/check-sign-dom.ts | 1 处 | legacy 诊断脚本 |
| `connectOverCDP()` | scripts/diagnose-cdp.ts | 1 处 | legacy 诊断脚本 |

### 5.2 BrowserPool 内部 EasyBR 调用分类

| 调用场景 | EasyBRClient 方法 | 说明 |
|----------|-------------------|------|
| 初始化连接 | `listWindows()` | 获取 EasyBR 窗口列表 |
| 重连 | `getWindow(windowId)` | 查询窗口状态 |
| 健康检查 | `getWindow(windowId)` | 检查窗口是否在线 |
| 关闭窗口 | `closeWindow(windowId)` | 通过 EasyBR 关闭 |
| 自动登录 | `getWindow(windowId)` | 登录前检查窗口状态 |

### 5.3 强依赖结论

**EasyBR 强依赖全部集中在 BrowserPool 内部**（4 处 connectOverCDP + 9 处 EasyBRClient）。
- 正式任务链路（Engine + 4 个 Handler）**不直接依赖 EasyBR**
- 只要替换 BrowserPool 的连接获取方式，即可解除 EasyBR 强依赖
- PlaywrightWindowAdapter 已经实现了等价的 `ensureWindowReady` / `getWorkerPage`，**完全可以替代 BrowserPool 的连接获取职责**

---

## 六、PlaywrightWindowAdapter 可替换点

### 6.1 Adapter 已实现接口

```typescript
// backend/window-adapter/PlaywrightWindowAdapter.ts
class PlaywrightWindowAdapter {
  ensureWindowReady(options): Promise<WindowReadyResult>;   // ← 替代 BrowserPool 初始化
  getWorkerPage(options): Promise<WorkerPageResult>;         // ← 替代 getStaffConnection 的 page 获取
  markBusy(runtimeKey): Promise<MarkResult>;                 // ← 替代 windowBusy.set
  markReady(runtimeKey): Promise<MarkResult>;                // ← 替代 windowBusy.delete
  refreshStatus(options): Promise<WindowStatusResult>;       // ← 替代 refreshRuntimeState
  closeWindow(options): Promise<AdapterCloseResult>;         // ← 替代 BrowserPool.close
}
```

### 6.2 与 BrowserPool 接口对应关系

| BrowserPool 接口 | Adapter 接口 | 差异 |
|------------------|--------------|------|
| `getStaffConnection(staffName, site)` | `getWorkerPage(options)` | Adapter 用三元组，BrowserPool 用 staffName |
| `acquireWindowLease(...)` | `markBusy(runtimeKey)` | **Adapter 不含锁**，需配合 WindowLockManager |
| `releaseWindowLease(...)` | `markReady(runtimeKey)` | 同上 |
| `ensureWindowReady(windowId)` | `ensureWindowReady(options)` | 接口形态一致 |
| `refreshRuntimeState(windowId)` | `refreshStatus(options)` | 接口形态一致 |
| `markWindowBusy/Idle` | `markBusy/markReady` | 旧接口已被 lease 替代 |

### 6.3 可替换点与不可替换点

| 位置 | 可否替换 | 说明 |
|------|----------|------|
| BrowserPool.getStaffConnection 的 page 来源 | ✅ 可替换 | 改用 adapter.getWorkerPage |
| BrowserPool.acquireWindowLease 的 busy 标记 | ⚠️ 部分可替换 | lock 仍需 WindowLockManager，busy 可改用 adapter.markBusy |
| BrowserPool.ensureWindowReady 的 P0 检查 | ✅ 可替换 | adapter.ensureWindowReady 已实现等价逻辑 |
| BrowserPool 内部 connectOverCDP | ✅ 可替换 | adapter 底层用 launchPersistentContext |
| WindowLockManager | ❌ **不可替换** | 纯内存锁，Adapter 无等价能力 |
| routes.ts 的 `(pool as any).p0Verified` | ⚠️ 需单独处理 | 需提供等价的状态查询接口 |

### 6.4 关键结论

**Adapter 不能完全替代 BrowserPool**，因为：
1. Adapter 没有锁能力（WindowLockManager 仍需保留）
2. Adapter 的 markBusy/markReady 是独立状态机，与 BrowserPool 的 windowBusy 并行
3. routes.ts 直接访问 BrowserPool 私有字段

**推荐方案**：Adapter 与 WindowLockManager **组合使用**，由 Engine 层统一调度（见第 9 节）。

---

## 七、方案 A：Handler 层接入分析

### 7.1 方案描述

每个 Handler 自行调用 Adapter：

```typescript
// 假想的 SignHandler 改造
export class SignHandler implements TaskHandler {
  async executeWorker(ctx: WorkerContext, ...): Promise<TaskResult> {
    const adapter = WindowAdapterRegistry.getInstance().getAdapter();
    const { page } = await adapter.getWorkerPage(ctx.options);   // ← Handler 自己取 page
    await adapter.markBusy(ctx.runtimeKey);                      // ← Handler 自己 markBusy
    try {
      const results = await executeSign(page, ...);
      return { success, processed, failed };
    } finally {
      await adapter.markReady(ctx.runtimeKey);                   // ← Handler 自己 markReady
    }
  }
}
```

### 7.2 优点

| 优点 | 说明 |
|------|------|
| 改动单点 | 只改目标 Handler，其他 Handler 不受影响 |
| 可按 Handler 逐个迁移 | SignHandler 先迁，Arrival/Dispatch/Integrated 后迁 |
| 回滚成本低 | 单个 Handler 出问题，回滚该 Handler 即可 |

### 7.3 缺点

| 缺点 | 说明 |
|------|------|
| 每个 Handler 重复处理窗口 ready/busy | 4 个 Handler 都要写相同的 markBusy/markReady 代码 |
| 容易和 AssignmentEngine 的锁冲突 | Engine 仍走 acquireWindowLease，Handler 又调 markBusy，**双状态机并行** |
| 任务状态恢复责任分散 | 异常恢复逻辑分散到每个 Handler，容易遗漏 |
| WorkerContext 需要新增字段 | 需要注入 options/runtimeKey，破坏当前简洁结构 |
| 违反 Phase 2-C 禁止事项 | **直接修改 Handler 执行逻辑**，违反本阶段原则 |

### 7.4 风险评估

**高风险**：Engine 的 `acquireWindowLease` 已经在 L1/L2/L3 三层标记 busy，Handler 再调 `adapter.markBusy` 会导致：
- 两个 busy 状态机并行，状态不一致
- 释放顺序难以保证（Engine finally 释放 lease，Handler finally 释放 adapter）
- 任务异常时，可能 Adapter 仍 busy 但 Engine 已释放 lock

---

## 八、方案 B：Engine 层接入分析

### 8.1 方案描述

由 Engine 统一管理窗口生命周期：

```text
AssignmentEngine.executeAssignment
  ├─ 1. 获取窗口连接（根据 runtime mode 切换）
  │     - legacy_easybr: pool.getStaffConnection()
  │     - playwright:    adapter.ensureWindowReady() + adapter.getWorkerPage()
  │
  ├─ 2. 取锁（统一走 WindowLockManager）
  │     - legacy_easybr: pool.acquireWindowLease()（内含 lock + busy + lease）
  │     - playwright:    lockManager.acquire() + adapter.markBusy()
  │
  ├─ 3. P0 前置检查
  │     - legacy_easybr: pool.ensureWindowReady()
  │     - playwright:    adapter.ensureWindowReady()（已含 P0 检查）
  │
  ├─ 4. 构建 WorkerContext（统一结构，Handler 无感知）
  │
  ├─ 5. handler.executeWorker(ctx, ...)
  │
  └─ finally: 释放（根据 runtime mode 切换）
        - legacy_easybr: lease.release()
        - playwright:    adapter.markReady() + lockManager.release()
```

### 8.2 优点

| 优点 | 说明 |
|------|------|
| 窗口生命周期统一 | ready/busy/lock 责任集中在 Engine |
| Handler 改动小 | **Handler 完全不修改**，仍只依赖 ctx.page |
| busy/ready 责任集中 | 不会出现双状态机并行 |
| 更接近当前调度职责 | Engine 本就负责窗口获取和释放 |
| 符合 Phase 2-C 原则 | 不修改任何 Handler 执行逻辑 |

### 8.3 缺点

| 缺点 | 说明 |
|------|------|
| Engine 改动更敏感 | executeAssignment 是核心路径，改动风险高 |
| 需要模式开关保护 | 必须 WINDOW_RUNTIME_MODE=legacy_easybr 默认，避免影响生产 |
| 双路径维护成本 | legacy 和 playwright 两套路径并存，需保证行为一致 |

### 8.4 风险评估

**中风险**：Engine 改动敏感，但通过模式开关可以完全回退到 legacy 路径。只要：
1. 默认 `WINDOW_RUNTIME_MODE=legacy_easybr`，正式任务零影响
2. 新增路径独立函数，不修改原有 `acquireWindowLease` 逻辑
3. 充分单元测试覆盖

---

## 九、推荐方案

### 9.1 推荐：方案 B（Engine 层接入）

**理由**：

1. **Handler 零改动**：方案 B 完全不修改 4 个正式 Handler，符合 Phase 2-C 禁止事项。方案 A 需要修改每个 Handler 的执行逻辑。

2. **避免双状态机冲突**：方案 B 由 Engine 统一管理 lock + busy，不会出现 Engine 释放 lease 但 Adapter 仍 busy 的问题。方案 A 的双状态机冲突几乎无法避免。

3. **责任收敛**：Engine 本就负责窗口获取和释放（`getStaffConnection` + `acquireWindowLease` + `ensureWindowReady` + `lease.release`），方案 B 只是在同一位置新增 runtime mode 切换，责任边界清晰。

4. **回退成本低**：模式开关切换到 `legacy_easybr` 即可完全回退，不需要回滚代码。

5. **符合 Phase 2-C 原则**：本阶段"不直接改任何真实业务 Handler"，方案 B 满足此约束。

### 9.2 接入位置

```text
backend/modules/assignment-engine/AssignmentEngine.ts
  executeAssignment() L700-L833
    ↓
  新增私有方法：resolveWorkerConnection(pool, adapter, staffName, site, runtimeMode)
    - legacy_easybr: 走原路径（getStaffConnection + acquireWindowLease）
    - playwright:    走新路径（adapter.ensureWindowReady + lockManager.acquire + adapter.markBusy）
    ↓
  返回统一的 WorkerConnectionHandle { page, windowId, release, renew }
```

### 9.3 关键设计约束

1. **不修改原有 acquireWindowLease 逻辑**：legacy 路径完全保持不变
2. **新增路径独立函数**：playwright 路径封装在独立函数中，便于测试和回退
3. **统一返回 Handle 接口**：两条路径返回相同的 `WorkerConnectionHandle`，Engine 后续逻辑无感知
4. **模式判断集中一处**：仅在 `resolveWorkerConnection` 内部判断 runtime mode，不散落到其他位置

---

## 十、WINDOW_RUNTIME_MODE 模式开关设计

### 10.1 配置定义

```env
# .env
WINDOW_RUNTIME_MODE=legacy_easybr
# 可选值：
#   legacy_easybr  — 走 BrowserPool + EasyBR + connectOverCDP（默认）
#   playwright     — 走 PlaywrightWindowAdapter + launchPersistentContext
```

### 10.2 设计要求

| 要求 | 实现 |
|------|------|
| 不影响当前 POC API | ✅ POC API（/api/window-adapter-poc）独立路由，不受 mode 影响 |
| 正式任务默认走 legacy_easybr | ✅ 默认值 `legacy_easybr` |
| 仅 `playwright` 时走 Adapter | ✅ 严格匹配字符串 |
| 模式判断集中一处 | ✅ 仅在 `resolveWorkerConnection` 内判断 |
| 日志必须输出 runtime mode | ✅ Engine 启动时 + 每次 executeAssignment 都记录 |

### 10.3 配置读取函数（建议新增，Phase 2-D 实现）

```typescript
// backend/config/runtimeMode.ts（Phase 2-D 新增，本阶段仅设计）
export type WindowRuntimeMode = 'legacy_easybr' | 'playwright';

export function getRuntimeMode(): WindowRuntimeMode {
  const raw = process.env.WINDOW_RUNTIME_MODE;
  if (raw === 'playwright') return 'playwright';
  return 'legacy_easybr';  // 默认值，包含未设置和非法值
}

export function isPlaywrightMode(): boolean {
  return getRuntimeMode() === 'playwright';
}
```

### 10.4 模式切换行为对照

| 行为 | legacy_easybr | playwright |
|------|---------------|------------|
| 窗口连接获取 | `pool.getStaffConnection()` | `adapter.getWorkerPage()` |
| 锁获取 | `pool.acquireWindowLease()`（内含 lock） | `lockManager.acquire()` + `adapter.markBusy()` |
| P0 前置检查 | `pool.ensureWindowReady()` | `adapter.ensureWindowReady()` |
| 锁释放 | `lease.release()`（内含 lock 释放） | `adapter.markReady()` + `lockManager.release()` |
| busy 续租 | `lease.renew()` | `lockManager.acquire` 幂等 + `adapter.markBusy` 重置 |
| Handler 行为 | 不变 | 不变 |
| WorkerContext 结构 | 不变 | 不变（page 来源不同） |

### 10.5 日志输出要求

```text
[Engine] runtime mode = legacy_easybr (WINDOW_RUNTIME_MODE=legacy_easybr)
[Engine] runtime mode = playwright (WINDOW_RUNTIME_MODE=playwright)
[executeAssignment] runtimeMode=playwright windowId=xxx taskId=xxx
```

---

## 十一、WorkerContext 统一设计

### 11.1 当前结构

```typescript
// backend/modules/assignment-engine/types.ts L29-L35
export interface WorkerContext {
  staffName: string;
  windowId: string;
  page: Page;
  log: LogFn;
}
```

### 11.2 目标结构（Phase 2-D 实现，本阶段仅设计）

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

### 11.3 设计原则

| 原则 | 说明 |
|------|------|
| Handler 尽量继续拿 page 操作 | ✅ page 字段保持不变，所有 Handler 无需修改 |
| Handler 不直接关心 EasyBR / Playwright | ✅ Handler 只用 page，不感知 runtime mode |
| runtimeKey 用于日志 | ✅ 可选字段，仅用于日志诊断 |
| runtimeMode 用于调试和回滚 | ✅ 可选字段，便于排查问题 |
| 向后兼容 | ✅ 新增字段全部可选，legacy 路径可不填 |

### 11.4 实现约束

1. **不破坏现有 Handler**：所有新增字段可选，legacy 路径可不填
2. **不强制 Handler 读取 runtimeMode**：Handler 不应包含 `if (ctx.runtimeMode === 'playwright')` 分支
3. **runtimeKey 仅用于日志**：不参与业务逻辑判断

### 11.5 与现有类型的兼容性

| 现有类型 | 兼容性 | 说明 |
|----------|--------|------|
| `WorkerContext` | ✅ 向后兼容 | 新增可选字段 |
| `TaskContext` | ✅ 不变 | 不需要改动 |
| `Assignment` | ✅ 不变 | 不需要改动 |
| `TaskHandler.executeWorker` | ✅ 不变 | 签名不变 |
| `LogFn` | ✅ 不变 | 不需要改动 |

---

## 十二、busy / lock 协调策略

### 12.1 八个核心问题的回答

#### Q1: WindowLockManager 继续保留还是替换？

**保留。**
- WindowLockManager 是纯内存锁，与 EasyBR/Playwright 无关
- Adapter 没有锁能力，无法替代
- 两条路径（legacy/playwright）都复用 WindowLockManager

#### Q2: adapter.markBusy 是否替代 windowBusy？

**playwright 模式下替代，legacy 模式下不变。**
- `legacy_easybr`：仍用 `BrowserPool.windowBusy`（通过 acquireWindowLease）
- `playwright`：用 `adapter.markBusy`，不操作 BrowserPool.windowBusy
- 两条路径互斥，不会出现双状态机并行

#### Q3: Engine 层 acquire lock 和 adapter.markBusy 的先后顺序？

**先 acquire lock，后 markBusy。**
```text
1. lockManager.acquire(windowId, taskId)   # 先取锁，失败抛 WindowBusyError
2. adapter.markBusy(runtimeKey)             # 锁成功后再标记 busy
```

**理由**：
- lock 失败应立即返回，不应触发 markBusy
- markBusy 失败时，lock 已持有，需在 finally 中释放

#### Q4: markReady 和 release lock 的先后顺序？

**先 markReady，后 release lock。**
```text
finally:
  1. adapter.markReady(runtimeKey)          # 先恢复窗口状态
  2. lockManager.release(windowId, taskId)  # 再释放锁
```

**理由**：
- markReady 是窗口状态恢复，应在锁内完成（其他任务不会抢占）
- release lock 后，窗口应已处于 ready 状态，可被下一个任务 acquire

#### Q5: 任务异常时如何恢复 ready？

**finally 块强制 markReady。**
```typescript
try {
  await handler.executeWorker(...);
} finally {
  // 无论成功/失败/超时/取消，都执行 markReady
  if (runtimeMode === 'playwright') {
    await adapter.markReady(runtimeKey).catch(e => 
      log('warning', `markReady failed: ${e.message}`)
    );
  }
  lockManager.release(windowId, taskId);
}
```

#### Q6: 如果 markBusy 成功但 Handler 抛错，如何 markReady？

**finally 块兜底。**
- markBusy 成功后，进入 try 块执行 Handler
- Handler 抛错触发 finally
- finally 中调用 markReady，捕获异常仅记录日志（不抛出，避免掩盖原始错误）

#### Q7: 如果浏览器已关闭，如何处理？

**ensureWindowReady 阶段检测并重启。**
- `adapter.ensureWindowReady` 已实现：检测到 `closed`/`failed` 状态时自动 `launchWindow` 重启
- 重启后状态变为 `login_required`（未登录）或 `ready`（已登录，cookie 持久化）
- 若重启后 `login_required`，任务返回 `failed`（login_required），释放锁

#### Q8: 如果 status=login_required，任务如何结束？

**任务返回 failed，释放锁，不调 markBusy。**
```text
1. ensureWindowReady → 返回 status=login_required
2. 不调 markBusy（窗口未就绪，不应标记 busy）
3. 任务标记为 failed（原因：login_required）
4. lockManager.release（如果已 acquire）
5. 不调 markReady（窗口本来就不是 busy）
```

### 12.2 统一协调流程（playwright 模式）

```text
任务开始：
  1. adapter.ensureWindowReady(options)
     → status=login_required → fail/login_required, return
     → status=busy → fail/busy, return
     → status=ready → 继续
  2. lockManager.acquire(windowId, taskId)
     → 失败（WindowBusyError）→ fail/busy, return
  3. adapter.markBusy(runtimeKey)
     → 失败 → release lock, fail, return
  4. 构建 WorkerContext { page, windowId, runtimeKey, runtimeMode }
  5. handler.executeWorker(ctx, ...)

任务结束（finally）：
  1. adapter.markReady(runtimeKey)  ← 先恢复窗口
  2. lockManager.release(windowId, taskId)  ← 再释放锁
  3. clearInterval(busyRenewalTimer)
```

### 12.3 统一协调流程（legacy 模式，保持不变）

```text
任务开始：
  1. pool.getStaffConnection(staffName, site)
  2. pool.acquireWindowLease({ windowId, taskId, ... })  ← 内含 lock + busy
  3. pool.ensureWindowReady(windowId)
  4. 构建 WorkerContext { page, windowId }
  5. handler.executeWorker(ctx, ...)

任务结束（finally）：
  1. lease.release()  ← 内含 lock 释放 + busy 清除
  2. clearInterval(busyRenewalTimer)
```

---

## 十三、异常恢复策略

### 13.1 异常场景与恢复策略

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
| release lock 失败 | finally | 仅记录日志（lockManager.release 幂等，下次 acquire 会被覆盖） | Engine |
| 进程崩溃 | — | 内存锁丢失，重启即清空；adapter 状态由 ensureWindowReady 重置 | 重启恢复 |

### 13.2 关键设计约束

1. **markReady 在 finally 中执行**：无论成功/失败/超时/取消，都尝试恢复窗口 ready
2. **markReady 异常仅记录日志**：不抛出，避免掩盖 Handler 的原始错误
3. **release lock 在 markReady 之后**：确保窗口状态恢复在锁内完成
4. **lease 模式（legacy）保持不变**：原有 acquireWindowLease/releaseWindowLease 逻辑完全不动

### 13.3 不变量（Invariant）

| 不变量 | 说明 |
|--------|------|
| lock 持有期间，窗口必为 busy | acquire 成功后立即 markBusy，release 前必 markReady |
| Handler 执行期间，lock 必持有 | lock 在 Handler 调用前 acquire，Handler 返回后 release |
| Handler 执行期间，windowId 不变 | 同一 windowId 的 page 注入 WorkerContext |
| markReady 失败不影响 release lock | 两者独立，互不阻塞 |

---

## 十四、分阶段接入路线

### 14.1 接入路线总览

```text
Phase 2-A ✅ 已完成
  - PlaywrightWindowAdapter 实现
  - POC API（/api/window-adapter-poc）
  - 独立验证脚本

Phase 2-B ✅ 已完成
  - AdapterTestHandler 测试任务链路
  - /api/playwright-adapter-test 路由
  - 未登录场景 + 已登录场景验证

Phase 2-C ✅ 当前阶段（审计与设计）
  - 正式任务链路审计
  - WINDOW_RUNTIME_MODE 设计
  - WorkerContext 统一设计
  - busy/lock 协调策略
  - 不改任何正式代码

Phase 2-D（下一阶段）
  - 新增 backend/config/runtimeMode.ts
  - 新增 WorkerConnectionHandle 抽象
  - 在 Engine 新增 resolveWorkerConnection 私有方法
  - 默认 WINDOW_RUNTIME_MODE=legacy_easybr
  - SignHandler 作为首个 playwright 模式测试对象（不改 Handler 代码，仅切换 mode）
  - 端到端验证：playwright 模式下 SignHandler 任务成功

Phase 2-E（后续）
  - ArrivalHandler / DispatchHandler / IntegratedHandler 切换 playwright 模式
  - 逐步废弃 BrowserPool（仅在 legacy 模式下保留）

Phase 2-F（最终）
  - 删除 legacy_easybr 模式
  - 删除 BrowserPool / easybr/
  - 全面切换到 PlaywrightWindowAdapter
```

### 14.2 Phase 2-D 验收标准（建议）

1. 新增 `backend/config/runtimeMode.ts`，默认 `legacy_easybr`
2. 新增 `WorkerConnectionHandle` 抽象类型
3. AssignmentEngine 新增 `resolveWorkerConnection` 私有方法，**不修改原有 acquireWindowLease 调用**
4. `WINDOW_RUNTIME_MODE=legacy_easybr` 时，正式任务行为完全不变
5. `WINDOW_RUNTIME_MODE=playwright` 时，SignHandler 任务可真实执行
6. 4 个正式 Handler 文件**零修改**
7. routes.ts **零修改**
8. bnsy-operator/ **零修改**

---

## 十五、Phase 2-D 建议

### 15.1 实施范围

**仅接入 SignHandler**，原因：
1. SignHandler 是最简单的 Handler（仅调用 `executeSign`）
2. SignHandler 的 `ctx.page` 使用模式最直接
3. SignHandler 已有 Phase 2-B 的 AdapterTestHandler 作为参考
4. 单 Handler 接入风险可控，验证通过后再扩展

### 15.2 实施步骤

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
  - ⚠️ routes.ts 修改需谨慎，仅新增 mode 读取，不改原有逻辑

Step 5: 端到端验证
  - WINDOW_RUNTIME_MODE=legacy_easybr：SignHandler 任务正常（回归测试）
  - WINDOW_RUNTIME_MODE=playwright：SignHandler 任务成功
  - 验证 markBusy/markReady 日志
  - 验证 lock acquire/release
  - 验证异常恢复（Handler 抛错后窗口 ready）
```

### 15.3 风险控制

| 风险 | 控制措施 |
|------|----------|
| Engine 改动影响生产 | 默认 legacy_easybr，正式任务零影响 |
| playwright 路径有 bug | 仅 SignHandler 使用，其他 Handler 仍走 legacy |
| WorkerContext 结构变化 | 新增字段全部可选，向后兼容 |
| routes.ts 修改 | 仅新增 mode 读取，不改原有逻辑 |

### 15.4 验收检查清单

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

## 附录 A：相关文档

| 文档 | 说明 |
|------|------|
| [window-adapter-design.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/window-adapter-design.md) | Phase 2-A Adapter 设计 |
| [phase-2a-window-adapter-report.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2a-window-adapter-report.md) | Phase 2-A 验收报告 |
| [phase-2b-adapter-task-report.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2b-adapter-task-report.md) | Phase 2-B 验收报告 |
| [phase-2b-supplementary-report.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2b-supplementary-report.md) | Phase 2-B 补充验收报告 |
| [playwright-runtime-design.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/playwright-runtime-design.md) | Playwright Runtime 设计 |

## 附录 B：关键代码位置索引

| 代码位置 | 行号 | 说明 |
|----------|------|------|
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L700-L833) | L700-L833 | executeAssignment |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L715) | L715 | getStaffConnection 调用点 |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L743) | L743 | acquireWindowLease 调用点 |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L752) | L752 | ensureWindowReady 调用点 |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L763-L768) | L763-L768 | WorkerContext 构建 |
| [AssignmentEngine.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/AssignmentEngine.ts#L790-L797) | L790-L797 | finally 释放 lease |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts#L1527-L1573) | L1527-L1573 | acquireWindowLease 实现 |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts#L1575-L1608) | L1575-L1608 | releaseWindowLease 实现 |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts#L1117-L1148) | L1117-L1148 | getStaffConnection 实现 |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts#L1098-L1111) | L1098-L1111 | ensureWindowReady 实现 |
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts#L1395-L1435) | L1395-L1435 | refreshRuntimeState 实现 |
| [WindowLockManager.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/WindowLockManager.ts#L84-L100) | L84-L100 | acquire 实现 |
| [WindowLockManager.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/WindowLockManager.ts#L111-L130) | L111-L130 | release 实现 |
| [types.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/types.ts#L29-L35) | L29-L35 | WorkerContext 定义 |
| [SignHandler.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/modules/assignment-engine/handlers/SignHandler.ts#L22-L40) | L22-L40 | SignHandler 实现 |

---

> 本文档为 Phase 2-C 审计输出，不包含任何代码修改。所有设计建议均待 Phase 2-D 实施验证。
