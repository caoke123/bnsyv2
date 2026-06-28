# Phase 2-D-Run 三次修正验收报告：复用升级前 P0 检查逻辑

> 阶段：Phase 2-D-Run（三次修正：复用旧 BrowserPool.verifyReady 作为 sign 任务前门槛）
> 验收日期：2026-06-27
> 前置阶段：Phase 2-D 全部通过 / Phase 2-D-Run 二次修正完成
> P0 复用源：`backend/browser/BrowserPool.ts` 中的 `verifyReady`（L368-451）+ `ensureNoPopup`（L812-840）

---

## 一、任务背景

### 1.1 前两次修正遗留问题

| 修正轮次 | 主要工作 | 遗留问题 |
|---------|---------|---------|
| 一次修正 | 统一测试三元组、修正状态判断、真实提交 sign 任务 | EasyBR 检查范围、日志关键字、siteId 转换 |
| 二次修正 | 显式 `--site`/`--staff`/`--window-id` 参数 + fail-fast + settings.json 校验 + POC/Sign siteId 转换 | 自动登录后未做 P0 就绪检查，可能提交 sign 任务到未就绪窗口 |

### 1.3 三次修正目标

用户明确要求：
1. **不重新写通用弹窗清理逻辑**，复用升级前项目中已验证过的 P0 检查代码
2. 将旧 P0 检查封装为测试脚本可调用的方法
3. 在自动登录后、提交 sign 任务前执行 P0 检查
4. **P0 不通过则停止**，不提交 sign 任务，不生成 unknown 报告
5. 报告中写清复用了哪段旧逻辑、P0 检查结果等

---

## 二、搜索旧 P0 代码的过程与发现

### 2.1 搜索关键词

按用户要求搜索以下关键词：
- `verifyReady` / `P0` / `p0Verified` / `ensureWindowReady` / `checkLiveness` / `hasSidebar`
- `clearPopup` / `clearDialogs` / `PopupManager` / `message-box` / `dialog`
- `checkAndAutoLogin` / `login-probe` / `app-container` / `el-menu` / `sidebar` / `dashboard`

### 2.2 搜索结果

在 `bnsy-operator-next/backend/` 中找到以下 P0 相关文件：

| 文件 | P0 相关内容 |
|------|------------|
| [BrowserPool.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/BrowserPool.ts) | `verifyReady`（L368-451）、`ensureNoPopup`（L812-840）、`ensureSidebarExpanded`（L842-862）、`checkAndAutoLogin`（L969-1077）、`ensureWindowReady`（L1098-1111）、`p0Verified` Set（L157）、多轮 P0 检查（L713-727） |
| [HealthMonitor.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/runtime/HealthMonitor.ts) | `checkLiveness`（L44-106）：三层校验（CDP + URL + DOM）+ 重试机制，tier: healthy/degraded/dead |
| [PopupManager.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/browser/PopupManager.ts) | `dismissAll`（L133）：统一弹窗治理，覆盖 native dialog / pay-dialog / el-dialog / message-box / overlay / toast |
| [routes.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/api/routes.ts) | `/api/diag/connections`（L107-150）：复用 `checkLiveness` + `p0Verified` 诊断接口 |

### 2.3 核心发现：旧 P0 检查链路

旧 P0 检查在 BrowserPool 中形成完整链路：

```
connect() 多轮 P0 检查（L713-727）
  ├─ cleanupRedundantPages   清理多余标签页
  ├─ ensureNoPopup           弹窗处理（PopupManager.dismissAll，5 轮重试）
  ├─ ensureSidebarExpanded   侧边栏展开
  └─ verifyReady             最终验证（7 项检查）
       ├─ cdp_evaluate       page.evaluate(() => 1) 3s 超时
       ├─ url_access         page.url() 可获取
       ├─ url_domain         URL 含 bnsy.benniaosuyun.com
       ├─ url_login          URL 不含 /login 或 Login
       ├─ url_dashboard      URL 含 /dashboard
       ├─ dom_missing        核心DOM存在（.el-menu / .app-container / .sidebar）
       └─ popup_blocking     无阻塞弹窗（.el-dialog__wrapper / .el-message-box__wrapper）
```

**结论：** `verifyReady` + `ensureNoPopup` 是旧 P0 检查的核心，已在线上验证过，可直接复用。

---

## 三、复用的旧 P0 逻辑详情

### 3.1 verifyReady 7 项检查（原样复制，保留判断顺序和超时策略）

| # | 检查项 | 旧 P0 实现 | 超时 | 复用方式 |
|---|--------|-----------|------|---------|
| 1 | cdp_evaluate | `page.evaluate(() => 1)` | 3s | 原样复制 |
| 2 | url_access | `page.url()` | - | 原样复制 |
| 3 | url_domain | `url.includes('bnsy.benniaosuyun.com')` | - | 原样复制 |
| 4 | url_login | `url.includes('/login') \|\| url.includes('Login')` | - | 原样复制 |
| 5 | url_dashboard | `url.includes('/dashboard')` | - | 原样复制 |
| 6 | dom_missing | `document.querySelector('.el-menu, .app-container, .sidebar')` | 3s | 原样复制 |
| 7 | popup_blocking | `.el-dialog__wrapper, .el-message-box__wrapper` 可见性 | 3s | 原样复制 |

### 3.2 ensureNoPopup 弹窗处理（原样复制，使用 PopupManager.dismissAll）

| 配置项 | 旧 P0 值 | 复用值 |
|--------|---------|--------|
| maxRounds | 5 | 5 |
| dismissAll timeout | 5000ms | 5000ms |
| dismissAll maxRounds | 3 | 3 |
| dismissAll verifyAfter | false | false |
| 重试间隔 | 500ms | 500ms |
| 可见弹窗选择器 | `.el-dialog__wrapper, .pay-dialog, .el-message-box` | 原样复制 |

### 3.3 多轮检查（与 BrowserPool L713-727 一致）

| 配置项 | 旧 P0 值 | 复用值 |
|--------|---------|--------|
| P0_ROUNDS | 3 | 3 |
| P0_INTERVAL_MS | 5000 | 5000 |
| 每轮流程 | cleanupRedundantPages + ensureNoPopup + ensureSidebarExpanded | ensureNoPopup + verifyReady（简化） |

**简化说明：** 测试脚本场景下窗口已通过 ensure-ready 启动，无需 cleanupRedundantPages（标签页清理）和 ensureSidebarExpanded（侧边栏展开），这两项属于窗口初始化逻辑，不属于 P0 就绪检查核心。

---

## 四、新增/修改文件清单

### 4.1 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| [backend/playwright-runtime/P0Verifier.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/playwright-runtime/P0Verifier.ts) | 355 | 复用旧 BrowserPool.verifyReady 7 项检查 + ensureNoPopup 弹窗处理 + 多轮 3 轮间隔 5s |
| [scripts/lib/p0-check.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/scripts/lib/p0-check.ts) | 75 | HTTP 客户端，调用 `/api/playwright-poc/window/p0-check` |

### 4.2 修改文件

| 文件 | 修改范围 | 说明 |
|------|---------|------|
| [backend/playwright-runtime/pocRoutes.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/playwright-runtime/pocRoutes.ts#L265-L297) | L265-297（末尾新增） | 新增 `POST /window/p0-check` 路由，仅新增不改动现有逻辑 |
| [scripts/sign-runtime-mode-verify.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/scripts/sign-runtime-mode-verify.ts) | 多处 | D6.5 P0 检查步骤 + 14 个 P0 报告字段 + 通过标准新增 P0 passed |

### 4.3 sign-runtime-mode-verify.ts 修改详情

| 位置 | 修改内容 |
|------|---------|
| L76 | 新增 `import { runP0Check } from './lib/p0-check';` |
| L33-42 | 头部注释新增 D6.5 P0 检查步骤说明 |
| L701-714 | AutoLoginReport 类型新增 14 个 P0 字段 |
| L765-778 | autoLoginReport 初始值新增 P0 字段 |
| L1258-1312 | verifyAutoLogin 中 D6.5 P0 检查步骤（D6 之后、D7 之前） |
| L1568-1575 | 报告头部标注"三次修正版" + P0 复用源 |
| L1582-1594 | 报告第 1 节修改/新增文件清单 |
| L1660-1685 | 报告新增第 10.5 节 P0 就绪检查 |
| L1775 | 通过标准新增第 5 项 P0 passed |

### 4.4 未修改文件（合规性保证）

| 文件 | 状态 |
|------|------|
| backend/modules/assignment-engine/AssignmentEngine.ts | ✓ 未修改 |
| backend/modules/assignment-engine/handlers/*.ts（4 个正式 Handler） | ✓ 未修改 |
| backend/api/routes.ts | ✓ 未修改 |
| backend/browser/BrowserPool.ts（旧 P0 源文件） | ✓ 未修改（仅复用） |
| backend/browser/runtime/HealthMonitor.ts | ✓ 未修改 |
| backend/browser/PopupManager.ts | ✓ 未修改 |
| backend/easybr/EasyBRClient.ts | ✓ 未修改 |
| bnsy-operator/（生产项目） | ✓ 未修改 |

---

## 五、P0 检查流程（D6.5，sign 任务前门槛）

### 5.1 流程位置

```
verifyAutoLogin()
  ├─ D3  ensure-ready 启动测试窗口
  ├─ D4  登录前状态判断
  ├─ D5  自动登录（如需）
  ├─ D6  refresh=true 返回 ready
  ├─ D6.5 P0 就绪检查（★ 三次修正新增 ★）
  │    ├─ 调用 runP0Check（POST /api/playwright-poc/window/p0-check）
  │    ├─ 后端 P0Verifier.runFullCheck 执行
  │    │    ├─ 多轮（3 轮，每轮间隔 5s）
  │    │    │    ├─ ensureNoPopup（PopupManager.dismissAll，5 轮重试）
  │    │    │    └─ verifyReady（7 项检查，3s 超时）
  │    │    └─ 返回 P0Report
  │    ├─ P0 通过 → 继续 D7
  │    └─ P0 不通过 → return（不提交 sign，不生成 unknown 报告）
  ├─ D7  第一次 sign 任务提交
  └─ D8-D18 后续验证
```

### 5.2 P0 失败时的行为（用户要求）

| 行为 | 是否执行 |
|------|---------|
| 停止后续 sign 任务验证 | ✓ 是 |
| 不提交 sign 任务 | ✓ 是 |
| 不生成 unknown 报告 | ✓ 是 |
| 输出失败原因 | ✓ 是（failedCheck + failedReason） |
| 记录 D6.5 为 FAIL | ✓ 是 |

### 5.3 启动命令

```powershell
$env:WINDOW_RUNTIME_MODE="playwright"
$env:BNSY_TEST_USERNAME="测试账号"
$env:BNSY_TEST_PASSWORD="测试密码"
npx tsx scripts/sign-runtime-mode-verify.ts --auto-login --site=site-真实ID --staff=真实员工名
```

---

## 六、P0 检查报告字段说明

### 6.1 后端 P0Report 结构（P0Verifier.ts 导出）

| 字段 | 类型 | 说明 |
|------|------|------|
| source | string | 复用的旧 P0 函数/文件 |
| startUrl | string | 开始 URL（第一轮检查前） |
| endUrl | string | 结束 URL（最后一轮检查后） |
| isDashboard | boolean | 是否 dashboard 页面 |
| isLoginPage | boolean | 是否仍在登录页 |
| hasCoreDom | boolean | 核心DOM是否存在（.el-menu/.app-container/.sidebar） |
| hasBlockingPopup | boolean | 是否检测到阻塞弹窗 |
| popupDismissAttempted | boolean | 旧 P0 是否尝试处理弹窗（调用 PopupManager.dismissAll） |
| passed | boolean | P0 最终结果（所有轮次均 ready 才算通过） |
| failedCheck | string | 失败检查项 |
| failedReason | string | 失败原因 |
| rounds | P0RoundResult[] | 多轮检查详情 |
| timestamp | string | 检查时间戳 |

### 6.2 验收报告中的 P0 章节（第 10.5 节）

验收报告新增第 10.5 节，输出以下内容（对应用户要求的 9 项）：

| 用户要求 | 报告字段 |
|---------|---------|
| 复用了哪个旧 P0 函数/文件 | source |
| 开始URL | startUrl |
| 结束URL | endUrl |
| 是否dashboard | isDashboard |
| 是否仍在login | isLoginPage |
| 核心DOM是否存在 | hasCoreDom |
| 是否检测到阻塞弹窗 | hasBlockingPopup |
| 旧P0是否尝试处理弹窗 | popupDismissAttempted |
| P0最终结果 | passed |
| 失败原因 | failedCheck + failedReason |

---

## 七、合规性检查

### 7.1 EasyBR 隔离检查

| 检查项 | 结果 |
|--------|------|
| P0Verifier.ts 未 import EasyBRClient | ✓ 通过（仅注释中提到"严禁修改"列表） |
| P0Verifier.ts 未调用 connectOverCDP | ✓ 通过 |
| p0-check.ts 未 import EasyBRClient | ✓ 通过 |
| p0-check.ts 未调用 connectOverCDP | ✓ 通过 |
| pocRoutes.ts 修改仅为新增路由 | ✓ 通过（未改动现有逻辑） |

### 7.2 正式业务代码未修改检查

| 文件 | 修改状态 |
|------|---------|
| AssignmentEngine.ts | ✓ 未修改 |
| ArrivalHandler.ts | ✓ 未修改 |
| DispatchHandler.ts | ✓ 未修改 |
| IntegratedHandler.ts | ✓ 未修改 |
| SignHandler.ts | ✓ 未修改 |
| routes.ts | ✓ 未修改 |
| BrowserPool.ts | ✓ 未修改（旧 P0 源文件，仅复用） |

### 7.3 生产项目未修改检查

| 文件 | 修改状态 |
|------|---------|
| bnsy-operator/ | ✓ 未修改 |

---

## 八、验证结果

### 8.1 TypeScript 编译检查

```bash
cd bnsy-operator-next && npx tsc --noEmit
```

**结果：** exit code 0，0 错误，0 警告。

### 8.2 静态代码检查（Part A-C）

```bash
npx tsx scripts/sign-runtime-mode-verify.ts
```

**结果：** 21/21 通过，0 失败。

| Part | 检查项数 | 通过 | 失败 |
|------|---------|------|------|
| A. 静态代码检查 | 12 | 12 | 0 |
| B. 运行时检查 | 3 | 3 | 0 |
| C. 异常路径验证 | 6 | 6 | 0 |
| **总计** | **21** | **21** | **0** |

### 8.3 关键静态检查项确认

| 检查项 | 结果 | 说明 |
|--------|------|------|
| A1. runtimeMode.ts 默认值为 legacy_easybr | ✓ | 未设置/非法值均回退 |
| A2. shouldUsePlaywrightAdapter 仅 sign+playwright 返回 true | ✓ | 仅 sign 任务走 playwright |
| A6. 4 个正式 Handler 业务逻辑零修改 | ✓ | 均未引用 Adapter / runtimeMode |
| A7. routes.ts 未承担 runtime 分发职责 | ✓ | runtime 分发仅在 Engine 内部 |
| A8. bnsy-operator/ 生产项目零修改 | ✓ | mtime 早于 next |
| A9. 无 ../bnsy-operator/ 跨项目 import | ✓ | 78 个 .ts 文件均无跨项目 import |
| A11. markReady 必须在 release lock 之前 | ✓ | release 闭包内顺序正确 |
| A12. ensureWindowReady 失败时不 markBusy | ✓ | 状态判断含抛错位于 markBusy 之前 |

---

## 九、通过标准达成情况（14 项）

| # | 通过标准 | 达成情况 | 说明 |
|---|---------|---------|------|
| 1 | siteId 非空 | ⏳ 待运行时验证 | 需用户提供真实 site.id |
| 2 | staffName 非空 | ⏳ 待运行时验证 | 需用户提供真实员工名 |
| 3 | windowId 非空 | ⏳ 待运行时验证 | 默认 staff-${staffName} |
| 4 | refresh=true 返回 ready | ⏳ 待运行时验证 | 自动登录后确认 |
| 5 | **P0 passed（复用旧 BrowserPool.verifyReady）** | ⏳ 待运行时验证 | ★ 三次修正新增 ★ |
| 6 | 第一次 sign 任务拿到 taskId | ⏳ 待运行时验证 | P0 通过后才提交 |
| 7 | 日志证明进入 playwright runtime | ⏳ 待运行时验证 | 日志含 runtimeMode=playwright |
| 8 | 日志证明进入 SignHandler 或 executeSign | ⏳ 待运行时验证 | 日志含签收关键字 |
| 9 | 任务结束后窗口 ready | ⏳ 待运行时验证 | markReady 间接证明 |
| 10 | 第二次 sign 任务拿到 taskId | ⏳ 待运行时验证 | P0 通过后才提交 |
| 11 | 第二次任务复用窗口 | ⏳ 待运行时验证 | 窗口仍 ready |
| 12 | Handler 未修改 | ✓ 静态检查通过 | A6 项 |
| 13 | routes.ts 未修改 | ✓ 静态检查通过 | A7 项 |
| 14 | bnsy-operator/ 未修改 | ✓ 静态检查通过 | A8 项 |

**说明：** 第 5 项 P0 passed 为三次修正新增的通过标准。P0 不通过时，第 6-11 项不允许执行。

---

## 十、与前两次修正的对比

| 维度 | 一次修正 | 二次修正 | 三次修正（本次） |
|------|---------|---------|----------------|
| 核心工作 | 统一三元组、修正状态判断、真实提交 sign | 显式 CLI 参数 + fail-fast + settings.json 校验 | 复用旧 P0 检查作为 sign 前门槛 |
| sign 任务前是否做 P0 检查 | ✗ 否 | ✗ 否 | ✓ 是（D6.5） |
| P0 检查来源 | 无 | 无 | 复用 BrowserPool.verifyReady |
| 弹窗处理 | 无 | 无 | 复用 PopupManager.dismissAll |
| P0 不通过时行为 | N/A | N/A | 停止，不提交 sign，不生成 unknown 报告 |
| 通过标准项数 | 15 | 13 | 14（新增 P0 passed） |
| 报告章节 | 20 项 | 20 项 | 20 项 + 10.5 P0 章节 |
| 新增文件 | 0 | 0 | 2（P0Verifier.ts + p0-check.ts） |
| 修改文件 | 1 | 1 | 2（verify.ts + pocRoutes.ts） |

---

## 十一、架构设计说明

### 11.1 为什么需要后端 P0Verifier（而非纯脚本侧检查）

测试脚本通过 HTTP API 与后端交互，无法直接访问 Playwright 的 `page` 对象。P0 检查的 7 项中：
- URL 检查（url_access / url_domain / url_login / url_dashboard）可通过 POC `/window/login-probe` 获取
- **DOM 检查（dom_missing）需要 `page.evaluate`**
- **弹窗检查（popup_blocking）需要 `page.evaluate`**
- **弹窗处理（ensureNoPopup）需要 `PopupManager.dismissAll`**

因此必须在后端新增 P0Verifier，并通过 POC 路由暴露给测试脚本。

### 11.2 为什么修改 pocRoutes.ts（而非 routes.ts）

| 考虑 | pocRoutes.ts | routes.ts |
|------|-------------|-----------|
| 是否正式业务路由 | ✗ 否（POC 专用） | ✓ 是 |
| 是否在"严禁修改"列表 | ✗ 否 | ✓ 是 |
| 是否已有 POC 窗口操作先例 | ✓ 有（/window/login, /window/navigate） | ✗ 无 |
| 修改影响范围 | 仅 POC 验证 | 正式业务 |

**结论：** 在 pocRoutes.ts 末尾新增 `/window/p0-check` 路由是最小侵入方案，不影响正式业务代码。

### 11.3 P0Verifier 与 BrowserPool 的关系

```
BrowserPool.ts（旧 P0 源文件，未修改）
  ├─ verifyReady（private，L368-451）       ── 原样复制 ──→ P0Verifier.verifyReady
  ├─ ensureNoPopup（private，L812-840）     ── 原样复制 ──→ P0Verifier.ensureNoPopup
  ├─ p0Verified Set（L157）                 ── 不复用（P0Verifier 无状态）
  └─ connect() 多轮检查（L713-727）         ── 简化复用 ──→ P0Verifier.runFullCheck

P0Verifier.ts（新增，独立于 BrowserPool）
  ├─ runFullCheck（公开入口）
  ├─ verifyReady（private，原样复制）
  ├─ ensureNoPopup（private，原样复制）
  └─ safeGetUrl（private，工具方法）
```

**设计原则：**
- P0Verifier 不继承 BrowserPool，不依赖 BrowserPool 实例
- P0Verifier 是无状态的，每次调用独立
- P0Verifier 仅 import `Page`（类型）和 `PopupManager`（弹窗处理），不 import EasyBRClient

---

## 十二、阶段建议

### 12.1 当前阶段结论

Phase 2-D-Run 三次修正已完成：
- ✓ 复用旧 BrowserPool.verifyReady 7 项检查
- ✓ 复用旧 ensureNoPopup 弹窗处理（PopupManager.dismissAll）
- ✓ D6.5 P0 检查作为 sign 任务前门槛
- ✓ P0 不通过时停止，不提交 sign，不生成 unknown 报告
- ✓ TypeScript 编译 0 错误
- ✓ 静态检查 21/21 通过
- ✓ 合规性检查全部通过

### 12.2 下一步建议

1. **运行时端到端验证**：用户提供真实 site.id / 员工名 / 测试账号，运行 `--auto-login` 模式，确认 P0 检查在真实环境中通过
2. **P0 失败场景测试**：手动制造 P0 失败场景（如关闭 Chrome、导航到非 dashboard 页面），确认 P0 不通过时正确停止
3. **进入 Phase 2-E**：P0 检查通过后，可将 PlaywrightWindowAdapter 接入 arrival 任务（第二个业务链路）
