# Phase 2-B 补充验收报告：已登录场景真实验证

> 阶段：DaoPai Next Phase 2-B 补充验收
> 范围：已登录场景 adapter_test 真实执行验证
> 前置：Phase 2-B 未登录场景已通过，已登录场景此前被 SKIP
> 验收日期：2026-06-27

---

## 一、是否修改代码

**仅增强验证脚本，未修改业务代码。**

| # | 文件 | 类型 | 说明 |
|---|------|------|------|
| 1 | `scripts/adapter-task-verify.ts` | 修改 | 新增 `--logged-in` 交互式验证模式 |

**未修改的文件**：
- `backend/window-adapter/AdapterTestHandler.ts`（Phase 2-B 已创建，未修改）
- `backend/window-adapter/adapterTestRoutes.ts`（Phase 2-B 已创建，未修改）
- `backend/window-adapter/PlaywrightWindowAdapter.ts`（Phase 2-A 已创建，未修改）
- `backend/index.ts`（Phase 2-B 已挂载路由，未修改）
- 所有其他后端代码

---

## 二、是否修改正式业务 Handler

**否。**

以下 4 个正式业务 Handler 文件均未修改：
- `backend/modules/assignment-engine/handlers/ArrivalHandler.ts`
- `backend/modules/assignment-engine/handlers/DispatchHandler.ts`
- `backend/modules/assignment-engine/handlers/IntegratedHandler.ts`
- `backend/modules/assignment-engine/handlers/SignHandler.ts`

---

## 三、是否修改正式任务接口

**否。**

`backend/api/routes.ts` 未修改。

---

## 四、是否修改 bnsy-operator/

**否。**

```bash
$ git -C bnsy-operator status --short
# (空输出，工作树干净)
```

---

## 五、手动登录前状态

**调用**：`POST /api/window-adapter-poc/ensure-ready`

**请求参数**：
```json
{
  "tenantId": "tenant-default",
  "siteId": "site-default",
  "windowId": "window-adapter-test-001",
  "staffName": "测试员工"
}
```

**返回结果**：
```json
{
  "runtimeKey": "tenant-default:site-default:window-adapter-test-001",
  "status": "login_required",
  "userDataDir": "E:\\...\\runtime\\profiles\\tenant-default\\site-default\\window-adapter-test-001",
  "launched": true,
  "currentUrl": "https://bnsy.benniaosuyun.com/login",
  "isLoggedIn": false,
  "message": "需要登录"
}
```

**结论**：窗口启动成功，但未登录，状态为 `login_required`，当前 URL 为登录页。

---

## 六、手动登录后 refresh=true 状态

**用户操作**：在 Chrome 窗口中手动登录目标系统（bnsy.benniaosuyun.com）。

**调用**：`GET /api/window-adapter-poc/status?...&refresh=true`

**返回结果**：
```json
{
  "runtimeKey": "tenant-default:site-default:window-adapter-test-001",
  "status": "ready",
  "userDataDir": "E:\\...\\runtime\\profiles\\tenant-default\\site-default\\window-adapter-test-001",
  "currentUrl": "https://bnsy.benniaosuyun.com/dashboard",
  "isLoggedIn": true,
  "isLoginPage": false,
  "lastUpdated": 1782551697371
}
```

**结论**：手动登录成功，窗口状态变为 `ready`，`isLoggedIn=true`，当前 URL 为 `/dashboard`。

---

## 七、adapter_test 第一次执行结果

**调用**：`POST /api/playwright-adapter-test`

**请求参数**：
```json
{
  "tenantId": "tenant-default",
  "siteId": "site-default",
  "windowId": "window-adapter-test-001",
  "staffName": "测试员工"
}
```

**提交响应**：
```json
{
  "taskId": "f406cfeb-2e09-498a-b37c-11400dcd29f7",
  "status": "pending",
  "runtimeKey": "tenant-default:site-default:window-adapter-test-001"
}
```

---

## 八、第一次任务 taskId

```
f406cfeb-2e09-498a-b37c-11400dcd29f7
```

---

## 九、第一次任务状态：必须 done

**调用**：`GET /api/operations/f406cfeb-2e09-498a-b37c-11400dcd29f7`

**返回结果**：
```json
{
  "taskId": "f406cfeb-2e09-498a-b37c-11400dcd29f7",
  "status": "done",
  "total": 1,
  "done": 1,
  "failCount": 0,
  "results": []
}
```

**结论**：✓ 任务状态为 `done`，done=1，failCount=0。

---

## 十、第一次任务日志摘要

**调用**：`GET /api/operations/f406cfeb-2e09-498a-b37c-11400dcd29f7/logs`

**日志条数**：12 条

```
[1] [info] Adapter 测试任务已提交: runtimeKey=tenant-default:site-default:window-adapter-test-001, staffName=测试员工
[2] [info] Adapter 测试任务开始: runtimeKey=tenant-default:site-default:window-adapter-test-001, staffName=测试员工
[3] [info] 步骤 1/5: 调用 adapter.ensureWindowReady...
[4] [info] ensureWindowReady 结果: status=ready, launched=false, userDataDir=..., isLoggedIn=true
[5] [info] 步骤 2/5: 调用 adapter.getWorkerPage...
[6] [info] 步骤 3/5: 调用 adapter.markBusy...
[7] [info] markBusy 结果: success=true, status=busy
[8] [info] 步骤 4/5: 执行最小页面验证（url + title）...
[9] [info] 页面验证: url=https://bnsy.benniaosuyun.com/dashboard, title=首页 - 凤凰系统-笨鸟速运
[10] [info] 步骤 5/5: 调用 adapter.markReady（不关闭窗口）...
[11] [info] markReady 结果: success=true, status=ready
[12] [info] Adapter 测试任务成功完成（窗口保持打开）
```

---

## 十一、日志是否包含 runtimeKey

**是。**

日志 [1]、[2] 均包含 `runtimeKey=tenant-default:site-default:window-adapter-test-001`。

---

## 十二、日志是否包含 page.url

**是。**

日志 [9] 包含 `url=https://bnsy.benniaosuyun.com/dashboard`。

---

## 十三、日志是否包含 page.title

**是。**

日志 [9] 包含 `title=首页 - 凤凰系统-笨鸟速运`。

---

## 十四、日志是否包含 markBusy

**是。**

日志 [6] `步骤 3/5: 调用 adapter.markBusy...`
日志 [7] `markBusy 结果: success=true, status=busy`

---

## 十五、日志是否包含 markReady

**是。**

日志 [10] `步骤 5/5: 调用 adapter.markReady（不关闭窗口）...`
日志 [11] `markReady 结果: success=true, status=ready`

---

## 十六、任务结束后窗口状态

**调用**：`GET /api/window-adapter-poc/status?...&refresh=true`

**返回结果**：
```json
{
  "runtimeKey": "tenant-default:site-default:window-adapter-test-001",
  "status": "ready",
  "currentUrl": "https://bnsy.benniaosuyun.com/dashboard",
  "isLoggedIn": true,
  "isLoginPage": false
}
```

**结论**：✓ 任务结束后窗口状态为 `ready`，未关闭，登录态保持。

---

## 十七、第二次 adapter_test 执行结果

**调用**：`POST /api/playwright-adapter-test`（同一窗口，不重新登录）

**提交响应**：
```json
{
  "taskId": "e8941c87-f630-455a-9aa0-1f2de3405c23",
  "status": "pending",
  "runtimeKey": "tenant-default:site-default:window-adapter-test-001"
}
```

**任务状态**：
```json
{
  "taskId": "e8941c87-f630-455a-9aa0-1f2de3405c23",
  "status": "done",
  "total": 1,
  "done": 1,
  "failCount": 0
}
```

**结论**：✓ 第二次任务状态为 `done`，done=1，failCount=0。

---

## 十八、第二次任务是否复用窗口

**是。**

第二次任务日志中 `ensureWindowReady 结果` 显示：
```
status=ready, launched=false, isLoggedIn=true
```

`launched=false` 表明窗口被复用（未重新启动 Chrome），直接使用了已存在的窗口。

---

## 十九、第二次任务结束后窗口状态

**调用**：`GET /api/window-adapter-poc/status?...&refresh=true`

**返回结果**：
```json
{
  "runtimeKey": "tenant-default:site-default:window-adapter-test-001",
  "status": "ready",
  "currentUrl": "https://bnsy.benniaosuyun.com/dashboard",
  "isLoggedIn": true,
  "isLoginPage": false
}
```

**结论**：✓ 第二次任务结束后窗口状态仍为 `ready`，未关闭，登录态保持。

---

## 二十、是否仍无 EasyBRClient import

**是。**

grep 验证：`backend/window-adapter/` 目录下所有 `.ts` 文件均无 `EasyBRClient` import 语句。

---

## 二十一、是否仍无 connectOverCDP 调用

**是。**

grep 验证：`backend/window-adapter/` 目录下所有 `.ts` 文件均无 `connectOverCDP(` 调用。

---

## 二十二、是否建议进入 Phase 2-C

**建议进入 Phase 2-C。**

Phase 2-B 补充验收已全部通过：

| # | 通过标准 | 状态 | 证据 |
|---|----------|------|------|
| 1 | 未登录场景阻断通过 | ✓ | Phase 2-B 验收报告已确认 |
| 2 | 已登录场景真实执行通过 | ✓ | 本报告第七~十六章 |
| 3 | adapter_test 任务状态为 done | ✓ | 第一次: done=1, failCount=0 |
| 4 | 任务日志包含 runtimeKey / page.url / page.title | ✓ | 本报告第十一~十三章 |
| 5 | markBusy / markReady 时序真实执行 | ✓ | 日志 [6][7] markBusy → [10][11] markReady |
| 6 | 任务结束后窗口保持 ready | ✓ | 第一次后: ready; 第二次后: ready |
| 7 | 同一窗口可以连续执行两次 adapter_test | ✓ | 两次均 done，第二次 launched=false |
| 8 | 正式业务 Handler 未修改 | ✓ | Arrival/Dispatch/Integrated/Sign 均未修改 |
| 9 | 正式任务接口未修改 | ✓ | routes.ts 未修改 |
| 10 | 生产项目 bnsy-operator/ 未修改 | ✓ | git status 为空 |
| 11 | 全程不依赖 EasyBR | ✓ | 无 EasyBRClient import，无 connectOverCDP 调用 |

**Phase 2-C 建议**：
- 选择 **SignHandler**（签到 Handler）作为首个真实业务 Handler 接入 PlaywrightWindowAdapter
- 理由：签到操作链路最短、副作用最小、易于回滚
- 接入方式：在 SignHandler 中通过 `WindowAdapterRegistry.getInstance().getAdapter()` 获取 adapter，调用 `ensureWindowReady` + `getWorkerPage` 替换原 BrowserPool 的 page 获取逻辑
- 接入前需确认：
  1. SignHandler 的任务流程与新接口的 markBusy/markReady 时序对齐
  2. AssignmentEngine.executeAssignment 中的窗口锁机制如何与 adapter 的 markBusy 协调
  3. 是否需要在 Engine 层面增加 adapter 模式开关（渐进迁移）
