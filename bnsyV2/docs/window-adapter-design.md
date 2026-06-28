# Window Adapter 设计文档（Phase 2-A）

> PlaywrightRuntime 与正式任务链路之间的兼容适配层。
>
> Phase 2-A：设计与实现，不接入正式任务执行。

## 一、为什么不直接替换 BrowserPool

直接替换 BrowserPool 存在以下风险：

1. **调用方众多**：AssignmentEngine、ArrivalHandler、DispatchHandler、IntegratedHandler、SignHandler 都直接依赖 BrowserPool 的接口（`getPage`、`markBusy`、`markIdle` 等）。一次性替换需要同时修改所有调用方，回归风险极高。
2. **接口形态不同**：BrowserPool 基于 `connectOverCDP` + windowId（字符串），PlaywrightRuntime 基于 `launchPersistentContext` + runtimeKey（tenantId:siteId:windowId 三元组）。接口语义不一致，直接替换会导致 windowId 误关、跨租户串台等问题。
3. **生产项目耦合**：bnsy-operator 生产项目仍在运行，直接替换可能影响线上任务。

因此，Phase 2-A 不直接替换 BrowserPool，而是**新增一个适配层**，让上层业务可以通过统一接口获取 Playwright page，同时保留 BrowserPool 不变。

## 二、为什么先做 adapter

1. **隔离变更**：adapter 是独立模块，不修改 BrowserPool、AssignmentEngine、Handlers。即使 adapter 有问题，也不影响生产。
2. **稳定上层接口**：adapter 对上层暴露稳定接口（`ensureWindowReady` / `getWorkerPage` / `markBusy` / `markReady`），上层业务只需依赖这套接口，不直接依赖 PlaywrightRuntime 内部实现。
3. **渐进迁移**：Phase 2-B 可以选择一个最小业务链路（如 SignHandler）接入 adapter，验证通过后再逐步迁移其他 Handler。
4. **测试边界清晰**：adapter 有独立的 POC API 和验证脚本，可以在不影响正式任务的前提下完整验证行为。

## 三、adapter 对上层暴露的接口

```typescript
// backend/window-adapter/types.ts

interface WindowAdapterOptions {
  tenantId: string;   // 必填
  siteId: string;     // 必填
  windowId: string;   // 必填
  staffName?: string;
  siteName?: string;
  windowName?: string;
}

class PlaywrightWindowAdapter {
  ensureWindowReady(options): Promise<WindowReadyResult>;
  getWorkerPage(options): Promise<WorkerPageResult>;
  markBusy(runtimeKey): Promise<MarkResult>;
  markReady(runtimeKey): Promise<MarkResult>;
  refreshStatus(options): Promise<WindowStatusResult>;
  closeWindow(options): Promise<AdapterCloseResult>;
}
```

**关键约束**：
- `options` 必须包含 `tenantId + siteId + windowId`，**禁止只传 windowId**。
- `getWorkerPage` 返回的 `page` 不可序列化，仅用于进程内调用，不通过 HTTP 返回。

### 状态码收敛

adapter 对外暴露 `AdapterWindowStatus`，收敛 PlaywrightRuntime 的内部状态：

| PlaywrightWindowStatus | AdapterWindowStatus | 说明 |
|------------------------|---------------------|------|
| launching / logging_in | `opening` | 上层不需要区分启动中和登录中 |
| ready                  | `ready` | 可执行任务 |
| busy                   | `busy` | 任务执行中 |
| login_required         | `login_required` | 需要登录 |
| closed                 | `closed` | 已关闭 |
| error                  | `failed` | 异常 |

## 四、adapter 如何调用 PlaywrightRuntime

adapter 是 PlaywrightRuntime 的**薄包装**，不持有额外状态：

```
上层业务 ──→ PlaywrightWindowAdapter ──→ PlaywrightRuntime
                    │
                    ├─ ensureWindowReady
                    │   ├─ 窗口不存在 → runtime.launchWindow()
                    │   └─ 窗口存在 → runtime.refreshState()
                    │
                    ├─ getWorkerPage
                    │   └─ runtime.getWindowStateJSON() + runtime.getPage()
                    │
                    ├─ markBusy → runtime.markBusy()
                    ├─ markReady → runtime.markReady()
                    ├─ refreshStatus → runtime.refreshState()
                    └─ closeWindow → runtime.closeWindow()
```

所有状态存储由 PlaywrightWindowStateStore 管理，adapter 不维护自己的状态映射。

## 五、状态流转规则

```
                    ensureWindowReady
                           │
               ┌───────────┴───────────┐
               │ 窗口不存在              │ 窗口存在
               ▼                       ▼
         launchWindow             refreshState
               │                       │
               ▼                       ▼
     ┌─────────────────┐     ┌─────────────────┐
     │ 检测到登录页     │     │ 已登录           │
     │ → login_required│     │ → ready          │
     ├─────────────────┤     ├─────────────────┤
     │ 已登录           │     │ 登录页           │
     │ → ready          │     │ → login_required│
     └─────────────────┘     ├─────────────────┤
                             │ busy（不抢占）   │
                             │ → busy          │
                             └─────────────────┘
```

**关键规则**：
- `ensureWindowReady` **不会自动登录**。如果返回 `login_required`，上层需调用 `manualLogin` 或提示用户手动登录。
- `ensureWindowReady` 遇到 `busy` 状态时**不抢占**，直接返回 `busy`。
- `markBusy` 是幂等的：窗口已是 busy 时再次调用返回成功。
- `markReady` **不关闭 context**，只改状态。

## 六、busy / ready 规则

### 何时 markBusy

任务开始执行前，上层业务调用 `markBusy(runtimeKey)`：
- 防止其他任务抢占同一窗口
- 状态从 `ready` → `busy`
- 不影响 page，不关闭 context

### 何时 markReady

任务执行结束后（无论成功或失败），上层业务调用 `markReady(runtimeKey)`：
- 释放窗口给下一个任务
- 状态从 `busy` → `ready`
- **不关闭 context**，窗口保持打开

### busy 状态下的行为

- `ensureWindowReady` 返回 `busy`，不抢占
- `getWorkerPage` 返回 `page` + `status=busy` + 提示消息（允许同一任务继续操作）
- `closeWindow` 仍可关闭（用于用户主动关闭或系统退出）

## 七、为什么任务结束不 close context

遵循 Phase 1-C 定稿的窗口生命周期策略：

1. **员工窗口登录后默认长期保持打开**。关闭后重新打开需要重新登录，增加成本。
2. **任务执行是高频操作**。如果每次任务结束都关闭窗口，登录频率会大幅上升。
3. **Playwright launchPersistentContext 会持久化 session cookie**（Phase 1-C 实测），但不应依赖此行为作为核心机制。
4. **只有用户主动关闭、系统退出、浏览器异常、或管理员操作时才关闭 context**。

因此，`markReady` 只改状态，不关闭 context。`closeWindow` 只用于主动关闭场景。

## 八、后续如何逐步接入 Handlers

### Phase 2-B：选择最小业务链路接入

建议选择 **SignHandler（签收）** 作为首个接入链路，理由：
1. 签收操作相对简单（导航到签收页 → 输入运单号 → 提交）
2. 签收是高频操作，验证价值高
3. 签收失败影响小（可重试）

接入步骤：
1. 在 SignHandler 中新增 `usePlaywrightAdapter` 开关（默认 false）
2. 开关打开时，通过 `WindowAdapterRegistry.getAdapter()` 获取 adapter
3. 调用 `ensureWindowReady` → `markBusy` → `getWorkerPage` → 执行签收 → `markReady`
4. 开关关闭时，仍走 legacy BrowserPool 路径

### Phase 2-C：扩展到其他 Handler

SignHandler 验证通过后，逐步接入：
1. ArrivalHandler（到件）
2. DispatchHandler（派件）
3. IntegratedHandler（综合操作）

### Phase 3：移除 legacy

所有 Handler 迁移完成后：
1. 移除 `BrowserPool` 中的 `connectOverCDP` 调用
2. 移除 `EasyBRClient`
3. 移除 `usePlaywrightAdapter` 开关（默认走 adapter）

## 九、模块清单

| 文件 | 职责 |
|------|------|
| `backend/window-adapter/types.ts` | 适配层类型定义 |
| `backend/window-adapter/PlaywrightWindowAdapter.ts` | 适配器实现 |
| `backend/window-adapter/WindowAdapterRegistry.ts` | 单例注册表 |
| `backend/window-adapter/pocAdapterRoutes.ts` | POC 调试路由 |
| `backend/window-adapter/index.ts` | 模块入口 |
| `scripts/window-adapter-verify.ts` | 验证脚本 |

## 十、POC API 清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/window-adapter-poc/health` | 健康检查 |
| POST | `/api/window-adapter-poc/ensure-ready` | 确保窗口就绪 |
| POST | `/api/window-adapter-poc/mark-busy` | 标记 busy |
| POST | `/api/window-adapter-poc/mark-ready` | 标记 ready（不关闭 context） |
| GET | `/api/window-adapter-poc/status` | 查询状态（实时刷新） |
| POST | `/api/window-adapter-poc/close` | 关闭窗口（幂等） |

## 十一、隔离合规要求

- `window-adapter/` 目录无 `EasyBRClient` import
- `window-adapter/` 目录无 `connectOverCDP` 调用
- 不引用 AssignmentEngine / ArrivalHandler / DispatchHandler / IntegratedHandler / SignHandler
- 不修改 `bnsy-operator/` 生产项目
- 不使用生产端口 3100 / 5175
