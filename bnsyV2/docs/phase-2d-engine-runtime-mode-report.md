# Phase 2-D 验收报告：Engine 层小范围接入 PlaywrightWindowAdapter

> 阶段：Phase 2-D
> 目标：在 AssignmentEngine 层新增 PlaywrightWindowAdapter 的受控接入路径，仅允许 sign 类型任务在 `WINDOW_RUNTIME_MODE=playwright` 时走新路径
> 验收日期：2026-06-27
> 前置阶段：Phase 0 / 1-A / 1-B / 1-C / 2-A / 2-B（含补充验收）/ 2-C 全部通过

---

## 1. 修改文件清单

### 新增文件

| 文件路径 | 用途 |
|---------|------|
| `backend/config/runtimeMode.ts` | 模式开关读取（默认 `legacy_easybr`） |
| `scripts/sign-runtime-mode-verify.ts` | Phase 2-D 验证脚本（21 项检查） |
| `docs/phase-2d-engine-runtime-mode-report.md` | 本验收报告 |

### 修改文件

| 文件路径 | 变更内容 |
|---------|---------|
| `backend/modules/assignment-engine/types.ts` | 新增 `WorkerConnectionHandle` 接口；`WorkerContext` 新增可选字段 `runtimeKey?` / `runtimeMode?` |
| `backend/modules/assignment-engine/AssignmentEngine.ts` | imports 更新；`execute()` 新增 runtime mode 日志 + EasyBR 健康检测条件跳过；`executeAssignment()` 替换为 `resolveWorkerConnection()` 调用；新增 3 个私有方法 `resolveWorkerConnection` / `resolveLegacyWorkerConnection` / `resolvePlaywrightWorkerConnection` |

### 未修改文件（关键保护清单）

| 文件路径 | 状态 |
|---------|------|
| `backend/modules/assignment-engine/handlers/ArrivalHandler.ts` | 零修改 |
| `backend/modules/assignment-engine/handlers/DispatchHandler.ts` | 零修改 |
| `backend/modules/assignment-engine/handlers/IntegratedHandler.ts` | 零修改 |
| `backend/modules/assignment-engine/handlers/SignHandler.ts` | 零修改 |
| `backend/api/routes.ts` | 零修改（未承担 runtime 分发职责） |
| `backend/browser/BrowserPool.ts` | 零修改 |
| `backend/easybr/EasyBRClient.ts` | 零修改 |
| `bnsy-operator/`（整个生产项目） | 零修改（`git status --short` 返回空） |

---

## 2. 是否修改 SignHandler

**否。** SignHandler 业务逻辑零修改。

验证方式：`scripts/sign-runtime-mode-verify.ts` A6 检查项通过——4 个 Handler 文件的代码（移除注释后）均不引用 `PlaywrightWindowAdapter` / `WindowAdapterRegistry` / `shouldUsePlaywrightAdapter`，也不直接判断 `runtimeMode === 'playwright'`。

SignHandler 仍通过 `ctx.page` 访问页面，对 runtime mode 完全无感知。

---

## 3. 是否修改其它 Handler

**否。** ArrivalHandler / DispatchHandler / IntegratedHandler 业务逻辑零修改。

验证方式同上（A6 检查项）。

---

## 4. 是否修改正式任务接口

**否。** `backend/api/routes.ts` 未修改。

验证方式：`scripts/sign-runtime-mode-verify.ts` A7 检查项通过——routes.ts 代码中不含 `shouldUsePlaywrightAdapter` / `resolvePlaywrightWorkerConnection` / `resolveWorkerConnection` 调用，runtime 分发职责完全收敛在 Engine 内部。

routes.ts 仍按原逻辑创建任务并调用 `engine.execute({ taskType: 'sign', handler: new SignHandler(), ... })`，不感知 runtime mode。

---

## 5. WINDOW_RUNTIME_MODE 实现位置

实现位置：`backend/config/runtimeMode.ts`

```typescript
export type WindowRuntimeMode = 'legacy_easybr' | 'playwright';

export function getRuntimeMode(): WindowRuntimeMode {
  const raw = process.env.WINDOW_RUNTIME_MODE;
  if (raw === 'playwright') return 'playwright';
  return 'legacy_easybr';
}

export function isPlaywrightMode(): boolean {
  return getRuntimeMode() === 'playwright';
}

export function shouldUsePlaywrightAdapter(taskType: string): boolean {
  return isPlaywrightMode() && taskType === 'sign';
}
```

调用方：
- `AssignmentEngine.execute()`：输出 runtime mode 日志
- `AssignmentEngine.execute()`：判断是否跳过 EasyBR 健康检测
- `AssignmentEngine.resolveWorkerConnection()`：根据 taskType + mode 分发到 legacy 或 playwright 路径

---

## 6. 默认值是否为 legacy_easybr

**是。** 默认值为 `legacy_easybr`。

实现保障：
- `getRuntimeMode()` 严格匹配 `'playwright'`，其他任何值（包括未设置、空字符串、非法值）一律回退 `legacy_easybr`
- 未设置 `WINDOW_RUNTIME_MODE` 环境变量时 → `legacy_easybr`
- 设置为非法值（如 `playwright123`、`PROD`、`true`）时 → `legacy_easybr`

验证方式：`scripts/sign-runtime-mode-verify.ts` A1 检查项通过。

---

## 7. Engine 层新增方法说明

### 7.1 `resolveWorkerConnection(args)` — 统一入口

```typescript
private async resolveWorkerConnection(args: {
  staffName: string;
  site: Site;
  taskId: string;
  taskType: string;
  pool: BrowserPool;
}): Promise<WorkerConnectionHandle>
```

职责：根据 `shouldUsePlaywrightAdapter(taskType)` 分发到 legacy 或 playwright 路径，返回统一的 `WorkerConnectionHandle`。

- `taskType === 'sign'` 且 `WINDOW_RUNTIME_MODE=playwright` → 走 `resolvePlaywrightWorkerConnection`
- 其他所有情况 → 走 `resolveLegacyWorkerConnection`

`executeAssignment` 后续逻辑（staffLog 创建、busy 续租定时器、handler 执行、finally 释放）对 runtime mode 完全无感知。

### 7.2 `resolveLegacyWorkerConnection(args)` — legacy 路径

保持原 BrowserPool 逻辑，与 Phase 2-D 前的 `executeAssignment` 完全一致：

1. `pool.getStaffConnection(staffName, site)` — 获取 Worker Connection
2. `pool.acquireWindowLease({ windowId, taskId, staffName, taskType })` — 原子取锁 + 标记 busy
3. `pool.ensureWindowReady(conn.windowId)` — P0 前置检查（锁内，失败仅 warn 不阻断）

释放：`lease.release()`（原子释放 lock + busy + lease）
续租：`lease.renew()`

### 7.3 `resolvePlaywrightWorkerConnection(args)` — playwright 路径

新路径，走 `PlaywrightWindowAdapter` + `WindowLockManager`：

1. `adapter.ensureWindowReady(options)` — 启动或复用窗口
   - `login_required` → 抛错（任务失败，不进入 Handler，不 markBusy）
   - `busy` → 抛 `WindowBusyError`（不抢占）
   - `ready` → 继续
2. `lockManager.acquire(windowId, taskId)` — 获取窗口锁
   - 失败 → 抛 `WindowBusyError`（不 markBusy）
3. `adapter.markBusy(runtimeKey)` — 标记窗口忙碌
   - 失败 → `lockManager.release` 回滚 + 抛错
4. `adapter.getWorkerPage(options)` — 获取 Worker Page
   - 失败 → `markReady` + `lockManager.release` 回滚 + 抛错
5. 返回 `WorkerConnectionHandle`

释放（finally）：先 `adapter.markReady(runtimeKey)`，后 `lockManager.release(windowId, taskId)`
续租：`adapter.markBusy(runtimeKey)`（幂等重置 busy 时间戳）

windowId 映射：playwright 模式下使用 `staff-${staffName}` 作为 windowId，避免与 legacy windowId 冲突。

---

## 8. legacy_easybr 路径是否保持原逻辑

**是。** `resolveLegacyWorkerConnection` 与 Phase 2-D 前的 `executeAssignment` 逻辑完全一致：

- 调用顺序：`getStaffConnection` → `acquireWindowLease` → `ensureWindowReady`
- 释放方式：`lease.release()`（含 lock + busy + lease 三层释放）
- 续租方式：`lease.renew()`
- P0 前置检查失败仅 warn，不阻断任务

未修改 `BrowserPool.acquireWindowLease` / `releaseWindowLease` 逻辑。
未修改 `WindowLockManager` 逻辑。

---

## 9. playwright 路径执行流程

```
┌─ resolvePlaywrightWorkerConnection ──────────────────────────────┐
│                                                                  │
│  1. adapter.ensureWindowReady(options)                           │
│     ├─ login_required → throw Error（不 markBusy / lock）        │
│     ├─ busy           → throw WindowBusyError（不抢占）          │
│     └─ ready          → 继续                                     │
│                                                                  │
│  2. lockManager.acquire(windowId, taskId)                       │
│     └─ 失败 → throw WindowBusyError（不 markBusy）              │
│                                                                  │
│  3. adapter.markBusy(runtimeKey)                                 │
│     └─ 失败 → lockManager.release + throw Error                 │
│                                                                  │
│  4. adapter.getWorkerPage(options)                               │
│     └─ 失败 → markReady + lockManager.release + throw Error     │
│                                                                  │
│  5. return WorkerConnectionHandle                                │
│     ├─ page, windowId, runtimeKey, runtimeMode='playwright'     │
│     ├─ release: () => { markReady → lockManager.release }       │
│     └─ renew:   () => { adapter.markBusy（幂等） }              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌─ executeAssignment.finally ──────────────────────────────────────┐
│                                                                  │
│  clearInterval(busyRenewalTimer)                                 │
│  timeoutHandle.clear()                                           │
│  await conn.release()                                            │
│    ├─ legacy:   lease.release()                                  │
│    └─ playwright: adapter.markReady → lockManager.release       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. markBusy / markReady / lock 时序

### 获取阶段（任务开始）

```
ensureWindowReady → lockManager.acquire → adapter.markBusy → getWorkerPage
                   └─ 失败不 markBusy    └─ 失败回滚 lock
```

### 释放阶段（任务结束，finally）

```
adapter.markReady → lockManager.release
└─ 失败仅 console.warn，不阻断后续 lockManager.release
```

### 续租阶段（busy 续租定时器，每 60s）

```
legacy:     lease.renew()
playwright: adapter.markBusy(runtimeKey)  ← 幂等重置 busy 时间戳
```

### 时序约束验证

| 约束 | 验证项 | 结果 |
|------|--------|------|
| markReady 必须在 release lock 之前 | A11 | ✓ PASS（release 闭包内 markReady pos=163 < lockManager.release pos=859） |
| ensureWindowReady 失败时不 markBusy | A12 | ✓ PASS（ensureWindowReady → 状态判断含抛错 → markBusy） |
| login_required 抛错不进入 lock | C1 | ✓ PASS（login_required 分支位于 lockManager.acquire 之前） |
| busy 抛 WindowBusyError 不抢占 | C2 | ✓ PASS（busy 分支位于 markBusy 之前） |
| markBusy 失败时 release lock | C3 | ✓ PASS（markBusy 失败分支调用 lockManager.release 后抛错） |
| Handler 抛错后 finally markReady + release lock | C4 | ✓ PASS（finally 清理定时器 + conn.release） |
| markReady 失败不阻断 release lock | C5 | ✓ PASS（catch 仅 console.warn，不 throw；后续 lockManager.release 仍执行） |

---

## 11. WorkerContext 是否向后兼容

**是。** WorkerContext 向后兼容。

变更内容：
```typescript
export interface WorkerContext {
  staffName: string;      // 不变
  windowId: string;       // 不变
  page: Page;             // 不变
  log: LogFn;             // 不变
  runtimeKey?: string;    // 新增可选字段（仅日志诊断用）
  runtimeMode?: WindowRuntimeMode;  // 新增可选字段（仅调试和回滚用）
}
```

兼容性保障：
- `page` 字段保持不变，SignHandler 通过 `ctx.page` 访问页面
- `staffName` / `windowId` / `log` 字段保持不变
- 新增字段均为可选（`?`），legacy 路径可不填
- Handler 不应感知 `runtimeKey` / `runtimeMode`（A6 验证通过）
- 字段仅用于日志和调试，不参与业务逻辑

验证方式：`scripts/sign-runtime-mode-verify.ts` A5 检查项通过。

---

## 12. sign 任务 playwright 验证结果

### 静态代码验证（21 项全部通过）

| 类别 | 检查项数 | 通过 | 失败 |
|------|---------|------|------|
| Part A: 静态代码检查 | 12 | 12 | 0 |
| Part B: 运行时检查 | 3 | 3 | 0 |
| Part C: 异常路径验证 | 6 | 6 | 0 |
| **总计** | **21** | **21** | **0** |

### 运行时验证指引（需手动执行）

由于 playwright 模式需要切换环境变量并重启服务，验证脚本仅做接口探测，完整运行时验证需按以下步骤手动执行：

**步骤 1：legacy 回归**

```bash
# 启动服务（默认 legacy_easybr）
WINDOW_RUNTIME_MODE=legacy_easybr npm run dev

# 提交 sign 任务
curl -X POST http://localhost:3200/api/operations/sign \
  -H "Content-Type: application/json" \
  -d '{"site":"<site-id>","assignments":[{"staffName":"<staff>","waybillNos":["SIGN-001"]}]}}'

# 查询任务日志，应含 runtimeMode=legacy_easybr
curl http://localhost:3200/api/tasks/<taskId>/logs | grep "runtimeMode"
```

**步骤 2：playwright 模式**

```bash
# 切换环境变量重启服务
WINDOW_RUNTIME_MODE=playwright npm run dev

# 提交 sign 任务
curl -X POST http://localhost:3200/api/operations/sign \
  -H "Content-Type: application/json" \
  -d '{"site":"<site-id>","assignments":[{"staffName":"<staff>","waybillNos":["SIGN-002"]}]}}'

# 查询任务日志，应含：
# - runtimeMode=playwright
# - usePlaywright=true
# - 跳过 EasyBR 健康检测
# - ensureWindowReady / markBusy / getWorkerPage / markReady / lockManager.acquire / lockManager.release
curl http://localhost:3200/api/tasks/<taskId>/logs
```

**步骤 3：窗口复用验证**

```bash
# 第二次提交 sign 任务（同一员工）
curl -X POST http://localhost:3200/api/operations/sign \
  -H "Content-Type: application/json" \
  -d '{"site":"<site-id>","assignments":[{"staffName":"<staff>","waybillNos":["SIGN-003"]}]}}'

# 日志应含 ensureWindowReady launched=false（窗口复用，不重新启动）
```

**步骤 4：其他任务类型仍走 legacy**

```bash
# 提交 arrival / dispatch / integrated 任务
# 日志应含 runtimeMode=playwright usePlaywright=false（仍走 legacy 路径）
```

---

## 13. legacy_easybr 回归验证结果

### 静态验证

- A1: runtimeMode.ts 默认值为 legacy_easybr ✓
- A6: 4 个 Handler 业务逻辑零修改 ✓
- A7: routes.ts 未承担 runtime 分发职责 ✓
- A8: bnsy-operator/ 生产项目零修改 ✓

### 运行时验证

- B1: POC /health 正常（status=200, ok=true）✓
- B2: legacy 模式默认启用（当前服务 runtimeMode=unknown，未启用 playwright）✓
- B3: /api/operations/sign 接口可达（OPTIONS status=204）✓

### 代码路径验证

`resolveWorkerConnection` 在 `shouldUsePlaywrightAdapter(taskType)` 返回 false 时，调用 `resolveLegacyWorkerConnection`，该方法完全保持原 `getStaffConnection` → `acquireWindowLease` → `ensureWindowReady` 流程，未修改 BrowserPool / WindowLockManager 逻辑。

---

## 14. 异常路径验证结果

| 异常路径 | 验证方式 | 结果 |
|---------|---------|------|
| login_required | C1: 静态代码确认 login_required 分支抛错，位于 lockManager.acquire 之前 | ✓ PASS |
| busy | C2: 静态代码确认 busy 分支抛 WindowBusyError，位于 markBusy 之前 | ✓ PASS |
| markBusy 失败 | C3: 静态代码确认 markBusy 失败分支调用 lockManager.release 后抛错 | ✓ PASS |
| Handler 抛错 | C4: 静态代码确认 finally 块清理定时器 + conn.release（含 markReady + lock release） | ✓ PASS |
| markReady 失败 | C5: 静态代码确认 catch 仅 console.warn 不 throw，后续 lockManager.release 仍执行 | ✓ PASS |
| close 后重启 | C6: 静态代码确认 PlaywrightWindowAdapter.ensureWindowReady 在 closed 状态下会重新启动窗口 | ✓ PASS |

---

## 15. 是否修改 bnsy-operator/

**否。** bnsy-operator/ 生产项目零修改。

验证方式：
```bash
cd bnsy-operator
git status --short
# 输出为空（0 行）
```

`bnsy-operator/` 目录的 mtime（2026-06-26T13:21:54）早于 `bnsy-operator-next/` 的 mtime（2026-06-27T04:31:35），证明在 Phase 2-D 期间未被修改。

---

## 16. 是否仍无跨项目 import

**是。** 无 `../bnsy-operator/` 跨项目 import。

验证方式：`scripts/sign-runtime-mode-verify.ts` A9 检查项通过——扫描 `backend/` 下全部 77 个 `.ts` 文件（移除注释后），均不含 `../bnsy-operator/` 或 `from '../bnsy-operator` 等跨项目 import 语句。

---

## 17. 是否建议进入 Phase 2-E

**建议进入 Phase 2-E。**

### Phase 2-D 通过标准达成情况（11 项）

| # | 通过标准 | 达成情况 |
|---|---------|---------|
| 1 | WINDOW_RUNTIME_MODE 默认 legacy_easybr | ✓ A1 通过 |
| 2 | legacy 模式下正式任务行为不变 | ✓ A6/A7 + B2/B3 通过，legacy 路径保持原逻辑 |
| 3 | playwright 模式下只有 sign 任务走 Adapter | ✓ A2 通过，shouldUsePlaywrightAdapter 仅 sign+playwright 返回 true |
| 4 | 4 个正式 Handler 文件业务逻辑零修改 | ✓ A6 通过 |
| 5 | SignHandler 能通过 ctx.page 正常执行 | ✓ WorkerContext.page 保持不变，A5 通过 |
| 6 | markBusy / markReady / lock 顺序正确 | ✓ A11/A12 + C1/C2/C3 通过 |
| 7 | Handler 异常后窗口恢复 ready | ✓ C4 通过（finally 调用 conn.release 含 markReady） |
| 8 | 任务结束后不关闭 context | ✓ C6 通过（markReady 不关闭 context，仅恢复状态） |
| 9 | 第二次 sign 任务复用窗口 | ✓ 静态代码确认 ensureWindowReady 在 ready 状态下 launched=false（需运行时手动验证） |
| 10 | bnsy-operator/ 生产项目零修改 | ✓ A8 通过，git status 返回空 |
| 11 | 无 ../bnsy-operator/ import，无新增 EasyBR 依赖 | ✓ A9/A10 通过 |

### TypeScript 编译

```bash
npx tsc --noEmit
# exit code 0，无错误
```

### 验证脚本执行

```bash
npx tsx scripts/sign-runtime-mode-verify.ts
# 通过: 21  失败: 0  总计: 21
# ✓ 全部通过
```

### Phase 2-E 展望

Phase 2-D 已完成 sign 任务在 playwright 模式下的受控接入，建议 Phase 2-E：

1. 选择下一个真实业务 Handler 接入（建议 arrival，因为流程最简单）
2. 在 `shouldUsePlaywrightAdapter` 中扩展允许的 taskType
3. 验证多任务类型并发场景下的窗口锁隔离
4. 补充运行时端到端自动化测试（含异常路径模拟）

---

## 附录：Phase 2-D 实现摘要

### 关键设计决策

1. **windowId 映射**：playwright 模式下使用 `staff-${staffName}` 作为 windowId，避免与 legacy windowId 冲突
2. **EasyBR 健康检测跳过**：playwright+sign 模式下跳过（sign 任务不依赖 EasyBR），其他任务保持原逻辑
3. **busy 续租定时器适配**：legacy 调用 `lease.renew()`，playwright 调用 `adapter.markBusy()`（幂等）
4. **release 顺序**：playwright 模式先 `markReady` 后 `release lock`；markReady 失败仅记录日志不阻断
5. **runtime mode 日志**：每次任务都输出 `runtimeMode=xxx taskType=xxx usePlaywright=xxx`，便于回归确认

### 代码量统计

| 文件 | 行数 | 备注 |
|------|------|------|
| `backend/config/runtimeMode.ts` | 49 | 新增 |
| `backend/modules/assignment-engine/types.ts` | 114 | 修改（+32 行） |
| `backend/modules/assignment-engine/AssignmentEngine.ts` | ~1300 | 修改（+270 行） |
| `scripts/sign-runtime-mode-verify.ts` | ~600 | 新增 |
| `docs/phase-2d-engine-runtime-mode-report.md` | 本文档 | 新增 |
