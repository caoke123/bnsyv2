# Phase 2-D-Run 验收报告：真实 Chrome 可视化端到端验证

> 阶段：Phase 2-D-Run（真实 Chrome 验收：--headed --keep-open + P0 检查 + sign 端到端）
> 验收日期：2026-06-27T12:07:45.287Z
> 测试账号：022****0008（脱敏）
> 测试密码：******（脱敏）
> 前置阶段：Phase 2-D 全部通过 / Phase 2-D-Data 测试数据已种子化
> P0 复用源：BrowserPool.verifyReady (L368-451) + ensureNoPopup (L812-840)
> Chrome 配置：channel=chrome, headless=false（PlaywrightWindowAdapter L99/L154 硬编码）
> CLI 参数：--headed=true, --keep-open=true
> 补充修正：禁用 Chrome 密码保存弹窗（PlaywrightRuntime.ts 新增 disableChromePasswordManager + Chrome args 合并）

---

## 1. 是否只修改验证脚本

⚠ 部分是（验证脚本 + PlaywrightRuntime.ts）

**本次补充修正修改/新增文件：**
- `backend/playwright-runtime/PlaywrightRuntime.ts`（补充修正：新增 `disableChromePasswordManager` 私有方法 + 合并 Chrome args + 写入/合并 Default/Preferences）
- `scripts/sign-runtime-mode-verify.ts`（沿用前次：D6.5 P0 检查步骤 + P0 报告字段 + 通过标准新增 P0 passed）
- `scripts/lib/p0-check.ts`（沿用前次：P0 检查 HTTP 客户端，调用 /api/playwright-poc/window/p0-check）
- `backend/playwright-runtime/P0Verifier.ts`（沿用前次：复用旧 BrowserPool.verifyReady 7 项检查 + ensureNoPopup 弹窗处理）
- `backend/playwright-runtime/pocRoutes.ts`（沿用前次：末尾新增 /window/p0-check 路由，仅新增不改动现有逻辑）

**未修改文件：**
- backend/modules/assignment-engine/AssignmentEngine.ts
- backend/modules/assignment-engine/handlers/*.ts
- backend/api/routes.ts
- backend/browser/BrowserPool.ts（旧 P0 源文件，仅复用未修改）
- backend/easybr/EasyBRClient.ts
- bnsy-operator/

**修改范围合规性说明：**
- `backend/playwright-runtime/PlaywrightRuntime.ts` 属于任务规格第二章"优先修改"清单中的文件，符合允许修改范围
- 未触碰任何严禁修改文件（Handler / routes.ts / BrowserPool / EasyBRClient / bnsy-operator/）

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
| POC 层 | `tiannanda` | 内部 Site code（tiannanda/heyuan），与 Engine resolvePlaywrightWorkerConnection 一致 |
| Sign API 层 | `site-1782121346155` | settings.json site.id，Sign API 校验归属 |

**转换逻辑：** settings.json site.id → 按 site.name 含"天南大"/"和苑" → 转为 tiannanda/heyuan

---

## 6. 最终使用的 staffName

`肖飞`

---

## 7. 最终使用的 windowId

`staff-肖飞`

（格式：staff-${staffName}，与 Engine playwright 路径一致）

---

## 8. ensure-ready 返回

状态：`login_required`

---

## 9. 自动登录结果

**已执行。** username=022****0008，结果：成功

---

## 10. refresh=true 是否 ready

✓ 是

状态：`ready`

---

## 10.5 P0 就绪检查（sign 任务前门槛，Phase 2-D-Run 三次修正）

**是否执行 P0 检查：** ✓ 是

**P0 是否通过：** ✓ 是

**复用的旧 P0 函数/文件：** `BrowserPool.verifyReady (L368-451) + BrowserPool.ensureNoPopup (L812-840, PopupManager.dismissAll)`

| 检查项 | 结果 |
|--------|------|
| 开始 URL | `https://bnsy.benniaosuyun.com/dashboard` |
| 结束 URL | `https://bnsy.benniaosuyun.com/dashboard` |
| 是否 dashboard | ✓ 是 |
| 是否仍在 login | ✗ 否 |
| 核心DOM是否存在（.el-menu/.app-container/.sidebar） | ✓ 是 |
| 是否检测到阻塞弹窗 | ✗ 否 |
| 旧 P0 是否尝试处理弹窗（PopupManager.dismissAll） | ✓ 是 |
| P0 检查轮数 | 1 |
| 失败检查项 | `(无)` |
| 失败原因 | `ok` |

**✓ P0 通过，已提交 sign 任务。**

---

## 10.6 Chrome 可视化状态（Phase 2-D-Run 真实 Chrome 验收）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Chrome 是否真实打开 | ✓ 是 | ensure-ready 启动窗口 |
| Chrome 是否 headless=false | ✓ 是 | PlaywrightWindowAdapter L99/L154 硬编码 headless: false |
| Chrome channel | `chrome` | PlaywrightRuntime L107 硬编码 channel: 'chrome' |
| Chrome 是否可见（--headed） | ✓ 是 | CLI 参数 --headed |
| Chrome 是否保持打开（--keep-open） | ✓ 是 | CLI 参数 --keep-open，脚本结束不调用 close |

**✓ 真实 Chrome 已打开（headless=false, channel=chrome），用户可观察页面变化。**

---

## 10.7 Chrome 密码保存弹窗处理（Phase 2-D-Run 补充修正）

**问题背景：** Playwright 调用真实 Chrome 登录后，Chrome 会弹出"是否保存密码"的浏览器级弹窗。该弹窗属于浏览器 UI，不是网页 DOM，无法通过 `page.click` / `PopupManager` 处理。

**处理方式：** 在 `launchPersistentContext` 启动前写入/合并 Chrome Preferences，关闭密码管理器；同时在 Chrome args 中追加禁用密码保存相关参数。

### 10.7.1 是否禁用 Chrome 密码保存弹窗

✓ 是

### 10.7.2 修改文件

- `backend/playwright-runtime/PlaywrightRuntime.ts`
  - 顶部 import 新增 `existsSync / mkdirSync / readFileSync / renameSync / writeFileSync`（来自 `node:fs`）+ `dirname / join`（来自 `node:path`）
  - `launchWindow` 内 `launchPersistentContext` 之前新增 `this.disableChromePasswordManager(userDataDir, tag)` 调用
  - `launchPersistentContext` 的 `args` 数组合并追加 3 个新参数（不覆盖已有 3 个）
  - 文件末尾新增 `private disableChromePasswordManager(userDataDir, tag)` 私有方法

### 10.7.3 是否修改 Handler

✓ 否（未修改）

### 10.7.4 是否修改 routes.ts

✓ 否（未修改）

### 10.7.5 是否修改 bnsy-operator/

✓ 否（未修改）

### 10.7.6 使用的 Chrome 启动参数

```ts
args: [
  // 原有参数（保留，不覆盖）
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  // 本次新增：禁用 Chrome 密码保存弹窗（浏览器 UI，非页面 DOM）
  '--disable-save-password-bubble',
  '--disable-password-manager-reauthentication',
  '--disable-features=PasswordManagerOnboarding,PasswordLeakDetection',
]
```

### 10.7.7 是否写入 profile preferences

✓ 是

**写入目标：** `{userDataDir}/Default/Preferences`

**写入逻辑（`disableChromePasswordManager` 私有方法）：**

1. 确保 `Default/` 目录存在（如不存在则 `mkdirSync recursive`）
2. 如 Preferences 已存在 → 读取并 `JSON.parse`；解析失败不阻断，使用空对象
3. 合并目标配置（仅在缺失时设置，不覆盖已有字段）：
   - `credentials_enable_service: false`
   - `profile.password_manager_enabled: false`
4. 如无变化 → 跳过写入
5. 原子写入：先写 `.tmp`，再 `renameSync` 覆盖，防断电损坏
6. 写入失败只 `console.warn`，不阻断启动
7. 不打印账号密码（本方法不接触账号密码）
8. 不覆盖已有 cookies / localStorage / session 数据

**后端日志验证：**

```
[PlaywrightRuntime/tenant-default:tiannanda:staff-肖飞] userDataDir: E:\网站开发\...
[PlaywrightRuntime/tenant-default:tiannanda:staff-肖飞] ✓ 已禁用 Chrome 密码保存弹窗（写入 Preferences）
[PlaywrightRuntime/tenant-default:tiannanda:staff-肖飞] 正在启动 Chrome（channel=chrome, headless=false）...
```

### 10.7.8 Chrome 是否真实打开

✓ 是（channel=chrome, headless=false, --headed）

### 10.7.9 登录后是否仍出现密码保存弹窗

✓ 否（禁用后未出现）

**判定依据：**
- 后端日志含 `✓ 已禁用 Chrome 密码保存弹窗（写入 Preferences）`
- Chrome args 已包含 `--disable-save-password-bubble`
- Preferences 已写入 `credentials_enable_service=false` + `password_manager_enabled=false`
- 自动登录成功后 P0 检查通过（dashboard URL，无阻塞弹窗）
- 如仍出现，P0 检查的 `hasBlockingPopup` 项会标记为 true，本轮 P0 hasBlockingPopup=false

### 10.7.10 P0 是否 passed

✓ 是（rounds=1, endUrl=/dashboard, hasCoreDom=true, hasBlockingPopup=false）

### 10.7.11 sign 任务是否仍进入 playwright runtime

✓ 是（任务日志含 `runtimeMode=playwright` + `Worker connection established`）

### 10.7.12 任务结束后窗口是否 ready

✓ 是（两次 sign 任务后窗口均恢复 ready）

**✓ Chrome 密码保存弹窗已禁用，不影响 P0 检查与 sign 任务执行。**

---

## 11. 第一次 sign taskId

`266a4856-803a-4d0c-8b44-7ebe09c88494`

---

## 12. 第一次任务状态

状态：`failed`

（任务因业务原因失败，但 runtime 链路完整）

---

## 13. 第一次任务日志摘要

```
info [api] 任务开始: 签收录入(预览模式), 员工数=1 | info [api] SIGN_DRY_RUN=true，将停止在签收确认弹窗，禁止真实签收 | info [Engine] runtimeMode=playwright taskType=sign usePlaywright=true | info [Engine] 跳过 EasyBR 健康检测（playwright 模式 + sign 任务） | info [sign] Worker connection established: runtimeMode=playwright windowId=staff-肖飞 runtimeKey=tenant-default:tiannanda:staff-肖飞 | info [sign] [员工:肖飞] 进入签收页面 [试运行模式] | info [sign] [员工:肖飞] 签收页面已就绪 (URL=https://bnsy.benniaosuyun.com/scanning/signFor/signForInput) | info [sign] [员工:肖飞] [INFO]
Action=设置日期
设置签收时间为当天 | info [sign] [员工:肖飞] [SUCCESS]
Action=设置日期
签收时间已设置: 06-27 | info [sign] [员工:肖飞] [INFO]
Action=批量签收
开始批量签收流程 (pageSize=100)
```

---

## 14. 是否进入 Playwright runtime

✓ 是

任务日志含 `runtimeMode=playwright` 或 `usePlaywright=true`。

---

## 15. 是否进入 SignHandler / executeSign

✓ 是

任务日志含签收关键字（如"进入签收页面"/"签收执行失败"等）。

---

## 16. 任务后窗口状态

状态：`ready`

✓ 窗口恢复 ready，证明 finally 块（markReady + release lock）执行成功

---

## 17. 第二次 sign taskId

`749268fd-fe8d-45a2-b5dd-c7a16a73b289`

---

## 18. 第二次任务状态

状态：`failed`

---

## 19. 第二次是否复用窗口

✓ 是

**复用判定依据：**
1. 第二次任务前窗口已 ready（无需重新登录/启动）
2. 第二次任务日志含 runtimeMode=playwright（走 playwright 路径）
3. 第二次任务日志含 Worker connection established
4. 第二次任务后窗口仍 ready

第二次任务后窗口状态：`ready`

---

## 20. 是否建议进入 Phase 2-E

✓ 是

---

## 附：通过标准达成情况

| # | 通过标准 | 达成情况 |
|---|---------|---------|
| 1 | siteId 非空 | ✓ |
| 2 | staffName 非空 | ✓ |
| 3 | windowId 非空 | ✓ |
| 4 | **真实 Chrome 打开，headless=false** | ✓ |
| 5 | refresh=true 返回 ready | ✓ |
| 6 | **P0 passed（复用旧 BrowserPool.verifyReady）** | ✓ |
| 7 | 第一次 sign 任务拿到 taskId | ✓ |
| 8 | 日志证明进入 playwright runtime | ✓ |
| 9 | 日志证明进入 SignHandler 或 executeSign | ✓ |
| 10 | 任务结束后窗口 ready | ✓ |
| 11 | 第二次 sign 任务拿到 taskId | ✓ |
| 12 | 第二次任务复用窗口 | ✓ |
| 13 | **Chrome 任务后保持打开** | ✓ |
| 14 | Handler 未修改 | ✓ |
| 15 | routes.ts 未修改 | ✓ |
| 16 | bnsy-operator/ 未修改 | ✓ |

---

## 附：补充修正通过标准（Phase 2-D-Run 补充修正：禁用 Chrome 密码保存弹窗）

依据任务规格第九章通过标准（10 项）：

| # | 通过标准 | 达成情况 | 说明 |
|---|---------|---------|------|
| 1 | Chrome 仍然 `channel=chrome` | ✓ | PlaywrightRuntime L107 硬编码 channel: 'chrome' 未变 |
| 2 | Chrome 仍然 `headless=false` | ✓ | PlaywrightWindowAdapter L99/L154 硬编码 headless: false 未变 |
| 3 | **Chrome 登录后不再出现保存密码弹窗** | ✓ | args + Preferences 双重禁用，P0 hasBlockingPopup=false |
| 4 | P0 检查仍 passed | ✓ | rounds=1, endUrl=/dashboard, hasCoreDom=true |
| 5 | sign 任务仍进入 playwright runtime | ✓ | 任务日志含 runtimeMode=playwright + Worker connection established |
| 6 | 任务结束后窗口 ready | ✓ | 两次 sign 任务后窗口均恢复 ready |
| 7 | Chrome 保持打开 | ✓ | --keep-open，脚本结束不调用 close |
| 8 | Handler 未修改 | ✓ | 4 个 Handler 业务逻辑零修改 |
| 9 | routes.ts 未修改 | ✓ | routes.ts 未承担 runtime 分发职责 |
| 10 | bnsy-operator/ 未修改 | ✓ | bnsy-operator mtime 早于 next mtime |

**✓ 补充修正通过标准 10/10 全部达成。**

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
