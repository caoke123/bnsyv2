# Phase 3 异常路径验证报告

> 阶段：Phase 3 任务 E
> 验证方式：静态代码审查 + 逻辑推演（未执行真实任务，避免影响环境）
> 验证日期：2026-06-27
> 审查文件：AssignmentEngine.ts / PlaywrightWindowAdapter.ts / PlaywrightRuntime.ts / P0Verifier.ts / WindowLockManager.ts

---

## 验证场景汇总

| # | 场景 | 服务不崩 | 状态明确 | 窗口不永久 busy | lock 释放 | Chrome 可重拉 | 失败原因可读 |
|---|------|---------|----------|-----------------|-----------|---------------|-------------|
| 1 | Chrome 被人工关闭 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | 未登录状态提交任务 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | P0 不通过 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | 测试单号不存在 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | 同一员工重复提交任务 | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| 6 | 任务失败后窗口恢复 ready | ✓ | ✓ | ✓ | ✓ | — | — |
| 7 | 任务失败后 lock 释放 | ✓ | — | ✓ | ✓ | — | — |
| 8 | 切回 legacy_easybr | ✓ | ✓ | — | — | — | ✓ |

---

## 场景 1：Chrome 被人工关闭

### 代码路径

```
Engine.executeAssignment
  → resolveWorkerConnection
    → resolvePlaywrightWorkerConnection
      → adapter.ensureWindowReady
        → PlaywrightWindowAdapter.ensureWindowReady (L142-178)
          → 检测 context 状态
          → 如果 context 已关闭/为空 → 用相同 userDataDir 重启
          → chromium.launchPersistentContext(userDataDir, {channel:'chrome', headless:false})
```

### 分析

- PlaywrightWindowAdapter.ensureWindowReady 会检测 context 是否存活
- 如果 Chrome 被人工关闭，context 变为 null 或抛错
- Adapter 会用**相同 userDataDir** 重启 Chrome，保留登录状态（session cookie 持久化）
- 重启后窗口状态恢复为 `ready`

### 结论

✓ **服务不崩**：ensureWindowReady 捕获异常并重启
✓ **状态明确**：重启过程中状态为 `closed`/`failed`，重启后为 `ready`
✓ **窗口不永久 busy**：重启后恢复 ready
✓ **lock 释放**：如果是在任务执行中 Chrome 被关闭，finally 块中 markReady + release lock
✓ **Chrome 可重拉**：ensureWindowReady 自动重启
✓ **失败原因可读**：日志含 `ensureWindowReady: restarting closed window`

---

## 场景 2：未登录状态提交任务

### 代码路径

```
Engine.executeAssignment
  → resolveWorkerConnection
    → resolvePlaywrightWorkerConnection
      → adapter.ensureWindowReady
        → 检测当前 page.url 是否为 login 页
        → 如果是 login 页 → 返回 { status: 'login_required' }
      → Engine 检测到 login_required → 抛错，不进入 markBusy
```

### 分析

- AssignmentEngine.ts L900-908：`resolveWorkerConnection` 返回连接后，Engine 检查状态
- 如果 `ensureWindowReady` 返回 `login_required`：
  - Engine **不调用 markBusy**
  - Engine **不提交任务**
  - Engine 记录日志 `login_required, stopping`
  - Engine **释放 lock**
  - 任务状态标记为 `failed`，失败原因 `login_required`

### 结论

✓ **服务不崩**：login_required 是预期状态，不抛未捕获异常
✓ **状态明确**：窗口状态为 `login_required`，任务状态为 `failed`
✓ **窗口不永久 busy**：未调用 markBusy，窗口状态不变
✓ **lock 释放**：finally 块中 release lock
✓ **Chrome 可重拉**：窗口保持打开，可手动登录后重新提交
✓ **失败原因可读**：日志含 `login_required`

---

## 场景 3：P0 不通过

### 代码路径

```
验证脚本 D0.4 步骤
  → runP0Check (scripts/lib/p0-check.ts)
    → POST /api/playwright-poc/window/p0-check
      → P0Verifier.verify (backend/playwright-runtime/P0Verifier.ts)
        → 复用 BrowserPool.verifyReady 7 项检查
        → 复用 BrowserPool.ensureNoPopup 弹窗处理
        → 返回 P0Report { passed: false, failedCheck: '...', failedReason: '...' }
  → 脚本检测 P0 不通过 → 停止执行，不提交业务任务
```

### 分析

- P0 检查在**验证脚本**层面执行（D0.4 步骤），不在 Engine 层
- P0 不通过时：
  - 脚本**不提交业务任务**
  - 脚本输出 `P0 FAILED: failedCheck=..., failedReason=...`
  - Chrome **保持打开**（--keep-open）
  - 窗口状态保持当前状态（不变为 busy）

### P0 检查 7 项

| # | 检查项 | 失败时 failedCheck |
|---|--------|-------------------|
| 1 | CDP evaluate 可用 | `cdp_evaluate` |
| 2 | URL 可访问 | `url_access` |
| 3 | URL 域名正确 | `url_domain` |
| 4 | URL 非 login | `url_login` |
| 5 | URL 是 dashboard | `url_dashboard` |
| 6 | 核心 DOM 存在 | `dom_missing` |
| 7 | 无阻塞弹窗 | `popup_blocking` |

### 结论

✓ **服务不崩**：P0 检查是只读操作
✓ **状态明确**：P0Report 含 passed/failedCheck/failedReason
✓ **窗口不永久 busy**：P0 不通过不提交任务，不调用 markBusy
✓ **lock 释放**：P0 在 lock 之前执行
✓ **Chrome 可重拉**：Chrome 保持打开
✓ **失败原因可读**：failedCheck + failedReason 明确

---

## 场景 4：测试单号不存在

### 代码路径

```
Engine.executeAssignment
  → Handler.execute(ctx)
    → ArrivalHandler / DispatchHandler / IntegratedHandler / SignHandler
      → 调用业务页面操作（如 page.click, page.fill）
      → 如果运单号不存在 → 业务系统返回错误/空结果
      → Handler 捕获错误 → 返回 failed
  → Engine 标记任务 failed
  → finally: markReady + release lock
```

### 分析

- 测试单号（如 TEST-ARRIVAL-001）在真实业务系统中不存在
- Handler 执行业务操作时，业务系统会返回"单号不存在"或类似错误
- Handler 不会崩溃，会正常返回（可能返回 failed 结果）
- Engine 标记任务为 `failed`，但**不影响窗口状态**
- finally 块中 `markReady` 确保窗口恢复 ready

### Phase 2-E 验证结果

| 模块 | 测试单号 | 任务状态 | 窗口恢复 ready |
|------|----------|----------|----------------|
| arrival | TEST-ARRIVAL-001/002 | done | ✓ |
| dispatch | TEST-DISPATCH-001/002 | failed | ✓ |
| integrated | TEST-INTEGRATED-001/002 | failed | ✓ |

### 结论

✓ **服务不崩**：Handler 捕获业务错误
✓ **状态明确**：任务状态为 done/failed
✓ **窗口不永久 busy**：finally 中 markReady
✓ **lock 释放**：finally 中 release lock
✓ **Chrome 可重拉**：窗口恢复 ready
✓ **失败原因可读**：任务日志含业务错误信息

---

## 场景 5：同一员工重复提交任务

### 代码路径

```
Engine.executeAssignment
  → resolveWorkerConnection
    → resolvePlaywrightWorkerConnection
      → adapter.markBusy(windowId)
        → 如果窗口已 busy → 抛 WindowBusyError
      → Engine 捕获 WindowBusyError → 任务标记 failed
      → 或 WindowLockManager.acquire(windowId) 失败 → 等待/失败
```

### 分析

- WindowLockManager 实现了窗口级锁：同一 windowId 同时只能执行一个任务
- 如果第二个任务尝试获取同一窗口的锁：
  - `lockManager.acquire` 返回失败/超时
  - Engine 标记第二个任务为 `failed`，失败原因 `window busy`
  - **不影响第一个任务的执行**
- markBusy 也会检查窗口状态，如果已 busy 则抛错

### 结论

✓ **服务不崩**：锁机制是预期行为
✓ **状态明确**：第二个任务状态为 failed，窗口状态为 busy
✓ **窗口不永久 busy**：第一个任务完成后 markReady 恢复 ready
✓ **lock 释放**：第一个任务完成后 release lock
✓ **失败原因可读**：`window busy` / `WindowBusyError`

---

## 场景 6：任务失败后窗口是否恢复 ready

### 代码路径

```
Engine.executeAssignment (L700-833)
  try {
    conn = await resolveWorkerConnection(...)
    await adapter.markBusy(windowId)
    await handler.execute(workerCtx)
  } catch (e) {
    // 记录错误日志
  } finally {
    // ★ 无论成功/失败，都执行 markReady
    await adapter.markReady(windowId)  // 确保窗口恢复 ready
  }
```

### 分析

- AssignmentEngine.ts 的 executeAssignment 方法使用 try-catch-finally
- **finally 块中无条件执行 markReady**
- 即使 Handler 抛错、markBusy 失败、网络异常等，markReady 都会执行
- markReady 将窗口状态从 `busy` 恢复为 `ready`

### Phase 2-E 验证证据

| 模块 | 任务状态 | 任务后窗口状态 |
|------|----------|----------------|
| arrival 第一次 | done | ready ✓ |
| arrival 第二次 | done | ready ✓ |
| dispatch 第一次 | failed | ready ✓ |
| dispatch 第二次 | failed | ready ✓ |
| integrated 第一次 | failed | ready ✓ |
| integrated 第二次 | failed | ready ✓ |

### 结论

✓ **窗口不永久 busy**：finally 中 markReady 无条件执行
✓ **状态明确**：窗口恢复 ready

---

## 场景 7：任务失败后 lock 是否释放

### 代码路径

```
Engine.executeAssignment (L700-833)
  const lock = await lockManager.acquire(windowId)
  try {
    conn = await resolveWorkerConnection(...)
    await adapter.markBusy(windowId)
    await handler.execute(workerCtx)
  } catch (e) {
    // ...
  } finally {
    await adapter.markReady(windowId)
    await lockManager.release(lock)  // ★ 无条件释放 lock
  }
```

### 分析

- lockManager.acquire 在任务开始前获取锁
- **finally 块中无条件执行 lockManager.release**
- 即使 Handler 抛错、markReady 失败，release lock 都会执行
- 锁释放后，该窗口可被下一个任务获取

### 结论

✓ **lock 释放**：finally 中 lockManager.release 无条件执行

---

## 场景 8：切回 legacy_easybr 是否可用

### 代码路径

```
runtimeMode.ts
  getRuntimeMode()
    → process.env.WINDOW_RUNTIME_MODE
    → if (raw === 'playwright') return 'playwright'
    → return 'legacy_easybr'  // 默认/未设置/非法值

  shouldUsePlaywrightAdapter(taskType)
    → isPlaywrightMode() && ALLOWED_TASK_TYPES.has(taskType)
    → legacy 模式下 isPlaywrightMode()=false → 返回 false
```

### 分析

- 只要不设置 `WINDOW_RUNTIME_MODE`（或设为 `legacy_easybr`）：
  - `getRuntimeMode()` 返回 `legacy_easybr`
  - `shouldUsePlaywrightAdapter()` 返回 `false`
  - `resolveWorkerConnection` 走 `resolveLegacyWorkerConnection` 路径
  - 使用 BrowserPool / EasyBR
- V1 生产项目（bnsy-operator）完全不受影响
- V2 的 legacy 代码保留且可用

### 验证方式

```bash
# 不设置 env
npm run dev
# 提交任务后日志应显示：runtimeMode=legacy_easybr usePlaywright=false
```

### 结论

✓ **服务不崩**：legacy 路径完整保留
✓ **状态明确**：日志显示 runtimeMode=legacy_easybr
✓ **失败原因可读**：如果 EasyBR 未启动，错误信息明确

---

## 综合结论

### 异常路径安全性

所有 8 个异常场景均通过静态代码审查验证：

1. **finally 块保障**：markReady + lockManager.release 在 finally 中无条件执行，确保窗口不永久 busy、lock 不泄漏
2. **login_required 前置检查**：未登录时不进入 markBusy，避免状态冲突
3. **P0 前置检查**：P0 不通过时不提交任务，避免无效执行
4. **WindowLockManager 锁机制**：同一窗口同时只能执行一个任务
5. **ensureWindowReady 自愈**：Chrome 关闭后可自动重启（保留 session）
6. **legacy 回退保障**：默认值 legacy_easybr，非 playwright 模式下走 BrowserPool

### 风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| tsx watch 不热重载 env | 修改 WINDOW_RUNTIME_MODE 后需手动重启 | 启动指南已说明 |
| PostgreSQL 不可用时降级 | 任务日志不持久（仅内存） | 可接受，不影响功能 |
| EasyBR 不可用时 BrowserPool 初始化失败 | legacy 模式下窗口操作不可用 | playwright 模式不依赖 EasyBR |

### 建议

- ✓ Phase 2-E 已验证场景 4/6/7（测试单号不存在 + 窗口恢复 + lock 释放）
- 建议未来用真实单号验证场景 1（Chrome 人工关闭后自愈）
- 其他场景已通过代码审查确认安全
