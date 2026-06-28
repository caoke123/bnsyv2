# Phase 4-B 验收报告：Header Runtime Mode 状态适配

> 阶段：DaoPai V2 Phase 4-B
> 主题：Header 在 `WINDOW_RUNTIME_MODE=playwright` 模式下不再误显 EasyBR 状态
> 编写日期：2026-06-27
> 前置阶段：Phase 4-A（Playwright 主运行模式接入）已通过

---

## 一、修改文件清单

| # | 文件路径 | 类型 | 改动规模 | 说明 |
|---|---------|------|---------|------|
| 1 | `backend/api/windowRuntimeRoutes.ts` | 新增 | 全文件 ~460 行 | 独立 Express Router，提供 4 个端点：`GET /api/runtime-mode`、`GET /api/sites/:siteId/playwright-windows`、`POST /api/sites/:siteId/playwright-windows/launch-all`、`POST /api/sites/:siteId/playwright-windows/ensure`。不依赖 EasyBRClient，仅复用 SettingsManager / WindowAdapterRegistry / PlaywrightRuntime。 |
| 2 | `backend/index.ts` | 修改 | 2 行 | 单行 import + 单行 `app.use(windowRuntimeRouter)`，注册位置在 `app.use(router)` 之后。 |
| 3 | `frontend/src/api/client.ts` | 修改 | 新增 API 段 | 新增类型 `WindowRuntimeMode` / `PlaywrightSiteWindowState` / `PlaywrightSiteWindowsResponse` 等，以及方法 `getWindowRuntimeMode` / `getSitePlaywrightWindows` / `launchAllPlaywrightWindows` / `ensurePlaywrightWindow`。 |
| 4 | `frontend/src/components/shared/WindowStateProvider.tsx` | 修改 | runtimeMode 感知 | context value 新增 `runtimeMode` / `isPlaywright`；mount 时调用 `loadRuntimeMode`；`fetchSiteWindows` 按 `runtimeMode` 分支数据源（playwright → `getSitePlaywrightWindows`，并强制清空 `easybrAbnormal`/`easybrMessage`；legacy → 原 `getSiteWindows`）；`refresh` 同时重载 runtimeMode。 |
| 5 | `frontend/src/components/layout/Header.tsx` | 修改 | v6 runtimeMode 分支 | import 新增 `Monitor` 图标 + `launchAllPlaywrightWindows` / `ensurePlaywrightWindow`；`handleInitWindow` 按 `isPlaywright` 分支（playwright → `ensurePlaywrightWindow` 同步 await，taskId 占位 `'pw-ensure'`，finally 清除标记；legacy → 原 `initWindow`）；`handleLaunchAll` 按 `isPlaywright` 分支调用 `launchAllPlaywrightWindows`；`pollInitTasks` 跳过 `'pw-'` 前缀；状态指示区按 `isPlaywright` 分支（playwright → `Monitor 图标 + "Playwright 模式" + "Chrome Runtime"`；legacy → 保留原 EasyBR 异常 + 重连按钮）；一键启动按钮文案 / tooltip 按 `isPlaywright` 分支。 |

**总改动文件数：5（1 新增 + 4 修改）**

---

## 二、是否修改 V1 / bnsy-operator

**否。**

V1 `bnsy-operator/` 目录拥有独立 `.git` 仓库。验证命令：

```powershell
Set-Location e:\网站开发\网点系统自动化\bnsy-operator
git status --short
```

输出为空（无任何改动行），证明 V1 完全干净，Phase 4-B 未触碰 V1 任何文件。

---

## 三、是否修改 Handler

**否。**

以下业务 Handler 文件均未修改：

- `backend/handlers/SignHandler.ts`
- `backend/handlers/ArrivalHandler.ts`
- `backend/handlers/DispatchHandler.ts`
- `backend/handlers/IntegratedHandler.ts`

Phase 4-B 改动全部集中在 `backend/api/windowRuntimeRoutes.ts`（新增独立路由）和前端展示层，不触及业务 Handler 的执行逻辑。

---

## 四、是否修改 routes.ts 业务逻辑

**否。**

`backend/api/routes.ts` 未做任何修改。Phase 4-B 通过新增独立路由文件 `windowRuntimeRoutes.ts` 实现 runtimeMode 感知能力，避免触碰既有业务接口。

legacy_easybr 模式下前端仍走原 `GET /api/sites/:siteId/windows` 和 `POST /api/sites/:siteId/windows/launch-all`（由 routes.ts 提供），逻辑保持不变。

---

## 五、是否修改 AssignmentEngine

**否。**

`backend/modules/assignment-engine/AssignmentEngine.ts` 未做任何修改。

Phase 4-B 仅在 `windowRuntimeRoutes.ts` 中复制了 AssignmentEngine 生成 `runtimeKey` 的约定（`tenantId=tenant-default` + `siteId=normalizeSiteNameToCode(site.name)` + `windowId=staff-${staffName}`），确保查询的 runtimeKey 与任务执行时一致，但不修改 Engine 本身。

---

## 六、当前 Header 调用链 Before / After

### Before（Phase 4-A 结束态，问题现象）

```
Header 启动按钮点击
  → frontend/src/api/client.ts: initWindow(siteId, browserId)
  → POST /api/sites/:siteId/windows/init  (routes.ts)
  → 后端走 EasyBR ensureWindowOpen
  → 状态轮询：GET /api/sites/:siteId/windows  (routes.ts)
      → 内部调 EasyBRClient.checkHealth + getBrowerList
      → EasyBR 未启动 → easybrHealth.reconnectNeeded=true
  → 员工卡片状态来源：GET /api/sites/:siteId/windows 的 status 字段
  → playwright 模式下 Chrome 已 ready，但前端仍读 EasyBR 状态
  → Header 显示 "EasyBR 连接异常" + "重连" 按钮，员工卡片显示 "离线"
```

**根因**：WindowStateProvider 数据源固定指向 `/api/sites/:siteId/windows`（依赖 EasyBR 健康检查），未感知 runtimeMode。

### After（Phase 4-B 完成态）

#### playwright 模式

```
Header 启动按钮点击（单窗口）
  → frontend/src/api/client.ts: ensurePlaywrightWindow(siteId, staffName)
  → POST /api/sites/:siteId/playwright-windows/ensure  (windowRuntimeRoutes.ts)
  → adapter.ensureWindowReady  (WindowAdapterRegistry 单例)
      → 不存在 → PlaywrightRuntime.launchWindow (headed, autoLogin=false)
      → 已存在 → PlaywrightRuntime.refreshState
  → 若 status=login_required → tryAutoLoginAfterEnsure
      → resolveCredentialFromSettings(staffName, siteName)  (从 settings.json)
      → PlaywrightRuntime.manualLogin(runtimeKey, credential)
      → 登录成功 → status=ready
  → 返回 { status, ready, launched, isLoggedIn, currentUrl, runtimeMode }

Header 一键启动按钮
  → launchAllPlaywrightWindows(siteId)
  → POST /api/sites/:siteId/playwright-windows/launch-all
  → 串行对每个 offline/closed/failed 窗口执行 ensure + tryAutoLoginAfterEnsure

状态轮询（5s）
  → WindowStateProvider.fetchSiteWindows 按 runtimeMode 分支
  → playwright → GET /api/sites/:siteId/playwright-windows
      → 仅查询 PlaywrightWindowStateStore 缓存（不触发 EasyBR）
      → 返回 { status, runtimeKey, runtimeMode, browserId: null }
  → 强制清空 easybrAbnormal / easybrMessage
  → 员工卡片状态来源：PlaywrightWindowStateStore
  → Header 显示 "Playwright 模式" + "Chrome Runtime"，员工卡片显示真实状态
```

#### legacy_easybr 模式

```
Header 启动按钮点击
  → initWindow(siteId, browserId)  (原 client.ts)
  → POST /api/sites/:siteId/windows/init  (routes.ts)
  → 后端走 EasyBR ensureWindowOpen  (BrowserPool)

状态轮询（5s）
  → WindowStateProvider.fetchSiteWindows
  → legacy → GET /api/sites/:siteId/windows  (routes.ts)
      → 内部调 EasyBRClient.checkHealth + getBrowerList
      → 返回 easybrHealth.reconnectNeeded
  → 员工卡片状态来源：EasyBR
  → Header 显示 "EasyBR 连接异常" + "重连" 按钮（原行为完整保留）
```

---

## 七、runtimeMode 获取方式

### 后端

`GET /api/runtime-mode`（windowRuntimeRoutes.ts）

- 只读端点，不触发窗口启动
- 不触发 EasyBR
- 不影响业务 routes
- 返回结构：

```json
{ "runtimeMode": "playwright" }
```

实现来源：`backend/config/runtimeMode.ts` 的 `getRuntimeMode()`，读取 `process.env.WINDOW_RUNTIME_MODE`，默认值 `legacy_easybr`（安全保障，env 配错时回退）。

### 前端

`frontend/src/api/client.ts` 的 `getWindowRuntimeMode()` 调用上述端点。

`WindowStateProvider` 在 mount 时调用 `loadRuntimeMode()`，将结果存入 context，供 `Header` 等消费者通过 `useWindowState()` 解构 `runtimeMode` / `isPlaywright`。`refresh()` 同时重载 runtimeMode，确保模式切换后能及时同步。

---

## 八、playwright 模式下 Header 展示

### 状态指示区

```
[Monitor 图标]  Playwright 模式  Chrome Runtime
```

- 颜色：`text-success`（绿色）
- tooltip：`Playwright 模式：Chrome 原生窗口运行时（runtimeMode=playwright）`
- **不显示**任何 EasyBR 相关文案（连接异常 / 服务未就绪 / 熔断倒计时 / 启动中）
- **不显示**重连按钮

### 启动按钮

| 场景 | 文案 | tooltip |
|------|------|---------|
| 默认 | `启动 Chrome` | 一键启动该网点所有未就绪 Chrome 窗口 |
| 启动中 | `启动中...` | 窗口启动中，请稍后 |

### 窗口 pill

| 状态 | pip 颜色 | pill 类 | tooltip |
|------|---------|---------|---------|
| offline | `bg-text-tertiary`（灰） | `offline` | `状态：离线\n点击启动 Chrome 窗口` |
| ready | `bg-success`（绿） | `online` | `状态：就绪\nChrome 窗口已打开` |
| busy | `bg-warning`（橙） | `busy` | `状态：执行中\nChrome 窗口已打开` |
| login_required | `bg-yellow-500`（黄） | `login-required` | `状态：待登录` |

点击行为：offline → 调 `ensurePlaywrightWindow`；其他状态 → 无需点击（Chrome 已是真实窗口，`browserId=null` 跳过 `openBrowser`）。

### 实测 DOM（Chrome DevTools MCP evaluate_script）

```json
{
  "pills": [{
    "className": "window-pill group relative online      ",
    "pipClass": "pip bg-success",
    "text": "肖飞",
    "title": "天南大 - 肖飞\n状态：就绪\nChrome 窗口已打开"
  }],
  "modeIndicatorText": "天南大肖飞Playwright 模式Chrome Runtime"
}
```

---

## 九、legacy_easybr 模式下 Header 展示

### 状态指示区

```
[AlertTriangle 图标]  EasyBR 连接异常  [重连按钮]
```

- 颜色：`text-warning`（橙色）
- 仅在 `easybrAbnormal=true` 时渲染
- 重连按钮调 `reconnectEasyBR()` → `POST /api/easybr/reconnect`

### 启动按钮

| 场景 | 文案 |
|------|------|
| 默认 | `一键启动` |
| 启动中 | `启动中...` |

### 窗口 pill

| 状态 | pip 颜色 | tooltip |
|------|---------|---------|
| offline | `bg-text-tertiary`（灰） | `状态：离线\n点击启动`（有 browserId）或 `未匹配到EasyBR浏览器，请先在EasyBR中创建`（无 browserId） |
| ready | `bg-success`（绿） | `点击打开窗口，悬停显示关闭按钮` |

点击行为：offline + 有 browserId → `initWindow`；非 offline + 有 browserId → `openBrowser`（聚焦 EasyBR 窗口）。

### 实测 DOM（Chrome DevTools MCP evaluate_script）

```json
{
  "pills": [{
    "className": "window-pill group relative       offline",
    "pipClass": "pip bg-text-tertiary",
    "text": "肖飞",
    "title": "天南大 - 肖飞\n状态：离线\n点击启动"
  }],
  "modeIndicatorText": "天南大肖飞一键启动EasyBR 连接异常重连",
  "easybrAbnormal": true,
  "hasReconnectBtn": true
}
```

---

## 十、启动按钮 playwright 分支调用的 API

### 单窗口启动（点击 offline pill）

| 项 | 值 |
|----|----|
| 前端方法 | `ensurePlaywrightWindow(siteId, staffName)` |
| HTTP | `POST /api/sites/:siteId/playwright-windows/ensure` |
| Body | `{ "staffName": "肖飞" }` |
| 后端路由文件 | `backend/api/windowRuntimeRoutes.ts` |
| 内部调用链 | `adapter.ensureWindowReady` → `PlaywrightRuntime.launchWindow`（首次）或 `refreshState`（已存在）→ `tryAutoLoginAfterEnsure`（若 `login_required`）→ `PlaywrightRuntime.manualLogin` |
| 启动参数 | `tenantId=tenant-default`、`siteId=<siteCode>`、`windowId=staff-${staffName}`、`headed=true`（默认）、`keepOpen=true`（adapter 不关闭 context） |

### 一键启动（启动 Chrome 按钮）

| 项 | 值 |
|----|----|
| 前端方法 | `launchAllPlaywrightWindows(siteId)` |
| HTTP | `POST /api/sites/:siteId/playwright-windows/launch-all` |
| Body | 无 |
| 后端路由文件 | `backend/api/windowRuntimeRoutes.ts` |
| 内部调用链 | 串行对每个 offline/closed/failed 窗口执行上述 ensure + autoLogin 流程 |
| 返回结构 | `{ launched, failed, partial, total, timeout, success, message, windows: [...], runtimeMode: 'playwright' }` |

**未新增重复逻辑**：复用 `WindowAdapterRegistry.getInstance().getAdapter()` 单例（与 AssignmentEngine 同一 adapter 实例），复用 `PlaywrightRuntime.getInstance()` 单例，复用 `SettingsManager` 凭据查找。

---

## 十一、窗口状态映射表

### 后端：PlaywrightWindowStatus → AdapterWindowStatus（adapter 层收敛）

| PlaywrightWindowStatus | AdapterWindowStatus | 说明 |
|------------------------|---------------------|------|
| `launching` | `opening` | 启动中 |
| `logging_in` | `opening` | 登录中 |
| `ready` | `ready` | 就绪 |
| `busy` | `busy` | 执行中 |
| `login_required` | `login_required` | 待登录 |
| `closed` | `closed` | 已关闭 |
| `error` | `failed` | 异常 |

### 后端：AdapterWindowStatus → 前端 WindowState（windowRuntimeRoutes.ts mapAdapterToFrontend）

| AdapterWindowStatus | WindowState | 前端展示 |
|---------------------|-----------|---------|
| `ready` | `ready` | 就绪 |
| `busy` | `busy` | 执行中 |
| `login_required` | `login_required` | 待登录 |
| `opening` | `connecting` | 启动中 |
| `closed` | `offline` | 离线 |
| `failed` | `degraded` | 不稳定 |

### 前端：WindowState → UI（Header.tsx statusColor / statusLabel）

| WindowState | pip 颜色 | label | pill 类 |
|------------|---------|-------|---------|
| `offline` | `bg-text-tertiary`（灰） | 离线 | `offline` |
| `connecting` | `bg-primary animate-pulse`（蓝脉冲） | 启动中 | `connecting` |
| `login_required` | `bg-yellow-500`（黄） | 待登录 | `login-required` |
| `connected` | `bg-primary animate-pulse`（蓝脉冲） | 启动中 | `connected` |
| `ready` | `bg-success`（绿） | 就绪 | `online` |
| `busy` | `bg-warning`（橙） | 执行中 | `busy` |
| `degraded` | `bg-orange-500`（橙警告） | 不稳定 | — |
| `initializing` | `bg-primary animate-pulse`（蓝脉冲） | 启动中 | `initializing` |

### 任务执行状态流转（PlaywrightWindowStateStore + adapter）

```
offline（未启动）
  ↓ ensureWindowReady
launching → (autoLogin) logging_in → ready
  ↓ markBusy (任务开始)
busy
  ↓ markReady (任务结束，不关闭 context)
ready
  ↓ closeWindow
closed → (再次 ensureWindowReady 可重启)
```

---

## 十二、手动验证结果

### 验证环境

- 后端：`cd bnsyV2 && npm run dev`（tsx watch，端口 3200）
- 前端：vite dev（端口 5275）
- 浏览器：Chrome DevTools MCP 控制的独立 Chrome 实例
- 测试账号：通过 `.env` 注入 `BNSY_TEST_USERNAME` / `BNSY_TEST_PASSWORD`（已 gitignore，未硬编码到代码或日志）

### 验证步骤与结果

| # | 验收项 | 命令 / 操作 | 结果 | 证据 |
|---|--------|------------|------|------|
| 1 | Header 不再显示 EasyBR 连接异常 | navigate to `http://localhost:5275/arrival`（playwright 模式） | ✅ 通过 | `modeIndicatorText` 不含 "EasyBR" 字样 |
| 2 | 不再显示 EasyBR 熔断倒计时 | 同上 | ✅ 通过 | Header DOM 无熔断相关元素 |
| 3 | 显示 Playwright / Chrome Runtime 状态 | evaluate_script 读 `.topbar-mid` textContent | ✅ 通过 | `"天南大肖飞Playwright 模式Chrome Runtime"` |
| 4 | 点击启动按钮后打开真实 Chrome | `POST /api/sites/site-1782121346155/playwright-windows/ensure` body `{"staffName":"肖飞"}` | ✅ 通过 | `launched: true`，Chrome 窗口可见弹出 |
| 5 | Chrome headless=false | PlaywrightRuntime.ts 第 122 行 `headless: opts.headless ?? false` + adapter 不传 headless | ✅ 通过 | 用户可见 Chrome 窗口（非 headless） |
| 6 | 自动登录后 P0 passed | 同上 API 返回 | ✅ 通过 | `isLoggedIn: true`，`currentUrl: "https://bnsy.benniaosuyun.com/dashboard"`（已到达 dashboard，登录态有效） |
| 7 | 肖飞卡片显示 ready / 就绪 | evaluate_script 读 `.window-pill` | ✅ 通过 | `pipClass: "pip bg-success"`，`title: "...状态：就绪\nChrome 窗口已打开"` |
| 8 | 任务执行中显示 busy / 执行中 | `POST /api/window-adapter-poc/mark-busy` body `{"tenantId":"tenant-default","siteId":"tiannanda","windowId":"staff-肖飞"}`，等 6s 轮询 | ✅ 通过 | `pipClass: "pip bg-warning"`，`title: "...状态：执行中..."`，pill 类含 `busy` |
| 9 | 任务结束恢复 ready / 就绪 | `POST /api/window-adapter-poc/mark-ready` 同 body，等 6s 轮询 | ✅ 通过 | `pipClass: "pip bg-success"`，`title: "...状态：就绪..."`，pill 类恢复 `online` |
| 10 | legacy_easybr 模式下原 EasyBR Header 逻辑仍可用 | 切换 `.env` 为 `WINDOW_RUNTIME_MODE=legacy_easybr`，重启后端，reload 前端页面 | ✅ 通过 | `modeIndicatorText: "天南大肖飞一键启动EasyBR 连接异常重连"`，`easybrAbnormal: true`，`hasReconnectBtn: true`，肖飞 pill `offline` + `bg-text-tertiary` + "点击启动" tooltip |

### 验证后状态

- `.env` 已恢复为 `WINDOW_RUNTIME_MODE=playwright`（Phase 4-A 主模式）
- 后端已重启加载 playwright 模式
- 测试期间启动的 Chrome 窗口已通过 `POST /api/window-adapter-poc/close` 关闭（`alreadyClosed: true`，进程重启时已自动清理）

### 关键 API 调用记录

```text
GET  /api/runtime-mode
  → { "runtimeMode": "playwright" }     [playwright 模式]
  → { "runtimeMode": "legacy_easybr" }  [legacy 模式]

GET  /api/sites/site-1782121346155/playwright-windows
  → {
      "siteId": "site-1782121346155",
      "siteName": "天南大",
      "windows": [{
        "windowName": "天南大-肖飞",
        "employeeName": "肖飞",
        "browserId": null,
        "status": "ready",
        "runtimeMode": "playwright",
        "runtimeKey": "tenant-default:tiannanda:staff-肖飞"
      }],
      "runtimeMode": "playwright"
    }

POST /api/sites/site-1782121346155/playwright-windows/ensure  body={"staffName":"肖飞"}
  → {
      "success": true,
      "runtimeKey": "tenant-default:tiannanda:staff-肖飞",
      "status": "ready",
      "ready": true,
      "launched": true,
      "currentUrl": "https://bnsy.benniaosuyun.com/dashboard",
      "isLoggedIn": true,
      "runtimeMode": "playwright"
    }

POST /api/window-adapter-poc/mark-busy   body={tenantId,siteId,windowId}
  → { "success": true, "runtimeKey": "...", "status": "busy" }

POST /api/window-adapter-poc/mark-ready  body={tenantId,siteId,windowId}
  → { "success": true, "runtimeKey": "...", "status": "ready" }
```

### 合规性自检

| 检查项 | 结果 |
|--------|------|
| TypeScript 编译（`npx tsc --noEmit -p tsconfig.json`） | ✅ exit 0 |
| Phase 4-A 自检 7/7 | ✅ 通过（含 runtimeMode 默认 legacy_easybr、Chrome 配置正确等） |
| V1 `bnsy-operator/` git status | ✅ 干净（独立 .git，无任何改动） |
| 业务 Handler 未修改 | ✅ SignHandler / ArrivalHandler / DispatchHandler / IntegratedHandler 均未触碰 |
| routes.ts 业务接口未修改 | ✅ 仅新增独立路由文件 |
| AssignmentEngine 未修改 | ✅ 仅复制 runtimeKey 约定 |
| PlaywrightRuntime / P0Verifier / WindowAdapter 核心未修改 | ✅ 仅作为只读调用方 |
| BrowserPool / EasyBRClient 未修改 | ✅ |
| 测试账号未硬编码到代码或日志 | ✅ 通过 `.env` 注入（已 gitignore），日志中未输出明文密码 |
| runtimeMode 默认逻辑未改 | ✅ `getRuntimeMode()` 仍默认 `legacy_easybr` |

---

## 十三、是否建议继续 Phase 4-B 后续观察

**建议继续观察，但本阶段可通过验收。**

### 已达成

1. ✅ Phase 4-B 全部 10 项验收标准通过
2. ✅ 不影响 Phase 4-A 多模块冒烟测试（runtimeMode 默认逻辑、PlaywrightRuntime 启动逻辑、adapter 接入路径均未修改）
3. ✅ 双模式切换可用（playwright 主模式 + legacy_easybr 回退模式 Header 行为均符合预期）
4. ✅ 状态流转完整（offline → ready → busy → ready，与 Phase 2-A 的 adapter markBusy/markReady 协议一致）

### 建议后续观察项

1. **真实任务执行验证**：本次 busy/ready 流转通过 POC `mark-busy` / `mark-ready` API 模拟。建议在下一阶段触发真实到件/派件/签收任务，确认 AssignmentEngine 在任务执行前后正确调用 adapter.markBusy / markReady，前端 Header 实时反映状态变化。
2. **多窗口并发启动**：本次仅验证单窗口（肖飞）。建议在多员工网点配置下验证 `launch-all` 串行启动的稳定性（避免 Chrome 资源竞争）。
3. **autoLogin 失败路径**：本次凭据正确，登录一次成功。建议观察密码过期 / 验证码弹窗等场景下 `login_required` 状态的展示与人工介入流程。
4. **runtimeMode 切换的运行时一致性**：当前切换模式需重启后端。若未来需要热切换，需评估 WindowStateProvider 缓存与后端状态同步策略。
5. **legacy 模式回归测试**：本次仅验证 Header 展示层。建议在 EasyBR 服务真实可用时，端到端验证 legacy 模式下任务执行链路完整性。

### 不建议在 Phase 4-B 内做的事

- 不要修改 `PlaywrightWindowAdapter` 暴露 `manualLogin`（会破坏 adapter 接口收敛）— 当前在路由层调用 `runtime.manualLogin` 是更轻量的方案。
- 不要把 `BNSY_TEST_USERNAME` / `BNSY_TEST_PASSWORD` 环境变量接入 `resolveCredential`（PlaywrightRuntime.resolveCredential 已通过 settings.json 提供主凭据来源，环境变量仅用于本机测试，不应进入核心代码）。
- 不要把 `autoLogin` 参数加到 `adapter.ensureWindowReady`（adapter 设计原则是"不自动登录，由上层决定"，本阶段在路由层调 `manualLogin` 已满足需求）。

---

## 附录：相关文档索引

- Phase 4-A 验收报告：`docs/phase-4a-playwright-primary-mode-report.md`
- 项目约束（project_memory）：runtimeMode 集中判断、WorkerContext 统一、测试账号环境变量传递等
- 关键代码位置：
  - 路由层：`backend/api/windowRuntimeRoutes.ts`
  - 前端状态源：`frontend/src/components/shared/WindowStateProvider.tsx`
  - Header 展示：`frontend/src/components/layout/Header.tsx`（v6）
  - runtimeMode 配置：`backend/config/runtimeMode.ts`
  - adapter 接入：`backend/window-adapter/PlaywrightWindowAdapter.ts`
  - Playwright 核心：`backend/playwright-runtime/PlaywrightRuntime.ts`
