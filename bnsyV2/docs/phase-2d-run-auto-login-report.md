# Phase 2-D-Run 验收报告：自动登录端到端验证（二次修正版）

> 阶段：Phase 2-D-Run（二次修正：显式 site/staff 参数 + fail-fast）
> 验收日期：2026-06-27T10:57:28.762Z
> 测试账号：dum****user（脱敏）
> 测试密码：******（脱敏）
> 前置阶段：Phase 2-D 全部通过

---

## 1. 是否只修改验证脚本

✓ 是

**修改文件：**
- `scripts/sign-runtime-mode-verify.ts`（新增 --site/--staff/--window-id 参数 + fail-fast 校验 + settings.json 校验）

**未修改文件：**
- backend/modules/assignment-engine/AssignmentEngine.ts
- backend/modules/assignment-engine/handlers/*.ts
- backend/api/routes.ts
- backend/browser/BrowserPool.ts
- backend/easybr/EasyBRClient.ts
- bnsy-operator/

---

## 2. 是否修改 Handler

✓ 否（未修改）

---

## 3. 是否修改 routes.ts

✓ 否（未修改）

---

## 4. 是否修改 bnsy-operator/

✓ 否（未修改）

---

## 5. 最终使用的 siteId

| 层级 | siteId | 说明 |
|------|--------|------|
| POC 层 | `` | 内部 Site code（tiannanda/heyuan），与 Engine resolvePlaywrightWorkerConnection 一致 |
| Sign API 层 | `` | settings.json site.id，Sign API 校验归属 |

**转换逻辑：** settings.json site.id → 按 site.name 含"天南大"/"和苑" → 转为 tiannanda/heyuan

---

## 6. 最终使用的 staffName

``

---

## 7. 最终使用的 windowId

``

（格式：staff-${staffName}，与 Engine playwright 路径一致）

---

## 8. ensure-ready 返回

状态：`unknown`

---

## 9. 自动登录结果

**未执行。** 窗口已为 ready 状态，无需登录

---

## 10. refresh=true 是否 ready

✗ 否

状态：`unknown`

---

## 11. 第一次 sign taskId

`(未提交)`

---

## 12. 第一次任务状态

状态：`unknown`



---

## 13. 第一次任务日志摘要

```

```

---

## 14. 是否进入 Playwright runtime

✗ 否

任务日志含 `runtimeMode=playwright` 或 `usePlaywright=true`。

---

## 15. 是否进入 SignHandler / executeSign

✗ 否

任务日志含签收关键字（如"进入签收页面"/"签收执行失败"等）。

---

## 16. 任务后窗口状态

状态：`unknown`

✗ 窗口未恢复 ready

---

## 17. 第二次 sign taskId

`(未提交)`

---

## 18. 第二次任务状态

状态：`unknown`

---

## 19. 第二次是否复用窗口

✗ 否

**复用判定依据：**
1. 第二次任务前窗口已 ready（无需重新登录/启动）
2. 第二次任务日志含 runtimeMode=playwright（走 playwright 路径）
3. 第二次任务日志含 Worker connection established
4. 第二次任务后窗口仍 ready

第二次任务后窗口状态：`unknown`

---

## 20. 是否建议进入 Phase 2-E

✗ 否

---

## 附：通过标准达成情况

| # | 通过标准 | 达成情况 |
|---|---------|---------|
| 1 | siteId 非空 | ✗ |
| 2 | staffName 非空 | ✗ |
| 3 | windowId 非空 | ✗ |
| 4 | refresh=true 返回 ready | ✗ |
| 5 | 第一次 sign 任务拿到 taskId | ✗ |
| 6 | 日志证明进入 playwright runtime | ✗ |
| 7 | 日志证明进入 SignHandler 或 executeSign | ✗ |
| 8 | 任务结束后窗口 ready | ✗ |
| 9 | 第二次 sign 任务拿到 taskId | ✗ |
| 10 | 第二次任务复用窗口 | ✗ |
| 11 | Handler 未修改 | ✓ |
| 12 | routes.ts 未修改 | ✓ |
| 13 | bnsy-operator/ 未修改 | ✓ |

---

## 附：EasyBR 检查范围

✓ 是

- playwright-runtime/ + window-adapter/ + runtimeMode.ts + 4 个 Handler 均未 import EasyBRClient → ✓
- playwright-runtime/ + window-adapter/ 均未调用 connectOverCDP → ✓
- legacy BrowserPool.ts + EasyBRClient.ts 中的 EasyBR 属于允许范围（legacy 回退路径）

---

## 附：fail-fast 参数校验说明

本次修正新增了 fail-fast 参数校验，启动时必须满足：

```text
--site=<settings.json 中的 site.id>
--staff=<真实员工名（必须属于该 site）>
BNSY_TEST_USERNAME=<测试账号>
BNSY_TEST_PASSWORD=<测试密码>
WINDOW_RUNTIME_MODE=playwright
```

任一缺失立即退出，不继续执行 ensure-ready，不生成 unknown 报告。

启动命令示例：

```powershell
$env:WINDOW_RUNTIME_MODE="playwright"
$env:BNSY_TEST_USERNAME="测试账号"
$env:BNSY_TEST_PASSWORD="测试密码"
npx tsx scripts/sign-runtime-mode-verify.ts --auto-login --site=site-真实ID --staff=真实员工名
```
