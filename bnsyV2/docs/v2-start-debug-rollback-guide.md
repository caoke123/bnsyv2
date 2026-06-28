# V2 启动调试回滚指南

> 本文档是 DaoPai V2（`bnsyV2`）的启动、调试、回滚操作手册。
> 适用于开发、测试、验收场景。

---

## 0. Phase 4-A 状态说明

> **自 Phase 4-A 起，V2 测试主运行模式切换为 `playwright`。**

| 项目 | 当前状态 |
|------|----------|
| V2 测试主运行模式 | `playwright`（真实 Chrome） |
| V2 备用回退模式 | `legacy_easybr`（旧 EasyBR 路径，保留可用） |
| V1（`bnsy-operator`） | 仍是生产稳定版，未修改 |
| `getRuntimeMode()` 代码默认值 | 仍为 `legacy_easybr`（安全保障，env 配错时回到 legacy） |
| V2 `.env` 文件 | 已设置 `WINDOW_RUNTIME_MODE=playwright` |

**关键说明：**

- 代码层 `getRuntimeMode()` 的默认值**未修改**，仍是 `legacy_easybr`，确保 env 配错或未设置时安全回退
- V2 测试环境通过 `.env` 文件显式设置 `WINDOW_RUNTIME_MODE=playwright`，使 playwright 成为测试主模式
- legacy 路径（BrowserPool / EasyBRClient / resolveLegacyWorkerConnection）**完整保留**，可随时一键回退
- 正确说法："legacy_easybr 已从 V2 测试主路径退为备用回退路径"，**不是**"legacy 已删除"

---

## 1. 如何启动 V2 后端

### 1.1 前置条件

```bash
cd bnsyV2
npm install        # 安装后端依赖
```

### 1.2 V2 推荐测试启动（playwright 模式）

**方式 A：使用 .env 文件（推荐，已默认配置）**

`.env` 文件已设置 `WINDOW_RUNTIME_MODE=playwright`，直接启动即可：

```bash
npm run dev
# 后端运行在 http://localhost:3200
# runtimeMode=playwright（由 .env 加载）
```

**方式 B：PowerShell 环境变量（临时覆盖 .env）**

```powershell
$env:WINDOW_RUNTIME_MODE="playwright"
npm run dev
```

**方式 C：Bash / Zsh**

```bash
WINDOW_RUNTIME_MODE=playwright npm run dev
```

### 1.3 legacy 模式启动（备用回退）

如需回退到 legacy_easybr 模式，参见 [第 4 章](#4-如何回退到-window_runtime_modelegacy_easybr备用回退路径)。

### 1.4 验证后端是否启动成功

```bash
curl http://localhost:3200/api/window-adapter-poc/health
# 返回 {"ok":true,...} 表示成功
```

验证当前 runtime 模式：

```bash
curl http://localhost:3200/api/runtime-mode
# 期望返回 {"runtimeMode":"playwright"}
```

或查看后端启动日志，提交任务时会出现：

```text
[Engine] runtimeMode=playwright taskType=sign usePlaywright=true
```

---

## 2. 如何启动 V2 前端

### 2.1 前置条件

```bash
cd bnsyV2/frontend
npm install        # 安装前端依赖
```

### 2.2 启动

```bash
cd bnsyV2/frontend
npm run dev
# 前端运行在 http://localhost:5275
```

### 2.3 访问

浏览器打开 http://localhost:5275

---

## 3. 如何设置 WINDOW_RUNTIME_MODE=playwright（V2 测试主模式）

> Phase 4-A 起，`playwright` 是 V2 测试主运行模式。

### 3.1 作用

`WINDOW_RUNTIME_MODE` 控制后端 `AssignmentEngine` 在获取窗口连接时走哪条路径：

| 模式 | 路径 | 浏览器 | 适用场景 | 当前地位 |
|------|------|--------|----------|----------|
| `playwright` | PlaywrightWindowAdapter | Playwright 原生 Chrome | V2 开发 / 测试 / 验收 | **主模式** |
| `legacy_easybr` | BrowserPool / EasyBR | EasyBR 指纹浏览器 | V1 兼容 / 回退备用 | 备用回退 |

**代码默认值仍是 `legacy_easybr`**（安全保障），V2 通过 `.env` 显式设置为 `playwright`。

### 3.2 allowlist

即使设为 `playwright`，也只允许以下 taskType 走 Adapter：

```text
sign / arrival / dispatch / integrated
```

其他 taskType（如 init_window）仍走 legacy 路径。

### 3.3 设置方式

**PowerShell（当前会话）：**

```powershell
$env:WINDOW_RUNTIME_MODE="playwright"
```

**PowerShell（持久，需重启终端）：**

```powershell
[Environment]::SetEnvironmentVariable("WINDOW_RUNTIME_MODE", "playwright", "User")
```

**.env 文件（bnsyV2/.env）：**

```text
WINDOW_RUNTIME_MODE=playwright
```

### 3.4 验证当前模式

提交任意任务后查看日志，关键字：

```text
runtimeMode=playwright         ← 已切换到 playwright
runtimeMode=legacy_easybr      ← 仍为 legacy
```

---

## 4. 如何回退到 WINDOW_RUNTIME_MODE=legacy_easybr（备用回退路径）

> legacy_easybr 是 V2 的备用回退路径，完整保留，可随时切换。

### 4.1 .env 文件回退（推荐）

修改 `bnsyV2/.env`：

```text
# 改为 legacy_easybr
WINDOW_RUNTIME_MODE=legacy_easybr

# 或直接注释该行（代码默认值就是 legacy_easybr）
# WINDOW_RUNTIME_MODE=playwright
```

重启后端生效。

### 4.2 当前会话回退（PowerShell 临时）

```powershell
# 方法 1：显式设置（覆盖 .env）
$env:WINDOW_RUNTIME_MODE="legacy_easybr"

# 方法 2：删除环境变量（.env 仍为 playwright 时无效，需配合修改 .env）
Remove-Item Env:\WINDOW_RUNTIME_MODE
```

> **注意**：PowerShell 环境变量优先于 `.env` 文件。但删除 PowerShell 环境变量后，`.env` 仍会生效。如需彻底回退，建议修改 `.env` 文件。

### 4.3 重启后端

环境变量修改后**必须重启后端**才生效（tsx watch 不会自动重新读取 env）：

```powershell
# 停止当前后端（Ctrl+C）
# 重新启动
npm run dev
```

### 4.4 验证回退成功

```text
日志应显示：runtimeMode=legacy_easybr
shouldUsePlaywrightAdapter 返回 false
任务走 BrowserPool / EasyBR 路径
```

### 4.5 安全保障

- 代码默认值（未设置 env）始终是 `legacy_easybr`
- 非法值（如 `playwright123`）也会回退 `legacy_easybr`
- `getRuntimeMode()` 严格匹配 `'playwright'`，其他一律回退
- legacy 路径（BrowserPool / EasyBRClient / resolveLegacyWorkerConnection）完整保留，未删除

---

## 5. 如何打开真实 Chrome 验证

### 5.1 前置条件

- 后端以 `WINDOW_RUNTIME_MODE=playwright` 启动
- 已安装 Playwright 浏览器：`npx playwright install chromium`

### 5.2 Chrome 配置（已硬编码）

```text
channel: 'chrome'              ← 使用系统安装的真实 Chrome
headless: false                ← 有头模式（可见窗口）
```

代码位置：
- `backend/playwright-runtime/PlaywrightRuntime.ts` L115: `channel: 'chrome'`
- `backend/window-adapter/PlaywrightWindowAdapter.ts` L99/L154: `headless: false`

### 5.3 通过 POC API 启动窗口

```bash
# 启动测试窗口
curl -X POST http://localhost:3200/api/window-adapter-poc/ensure-ready \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"tenant-default","siteId":"tiannanda","windowId":"staff-肖飞"}'
```

Chrome 窗口会自动弹出。

### 5.4 通过验证脚本启动

```powershell
$env:WINDOW_RUNTIME_MODE="playwright"
$env:BNSY_TEST_USERNAME="022****0008（你的真实测试账号）"
$env:BNSY_TEST_PASSWORD="<你的密码>"

npx tsx scripts/multi-runtime-mode-verify.ts `
  --auto-login `
  --site=site-1782121346155 `
  --staff=肖飞 `
  --headed `
  --keep-open `
  --modules=arrival,dispatch,integrated
```

---

## 6. 如何保持 Chrome 不关闭

### 6.1 脚本参数

```text
--keep-open    ← 任务结束后不调用 closeWindow，Chrome 保持打开
```

### 6.2 运行时机制

- PlaywrightWindowAdapter 任务结束后调用 `markReady`（非 `close`）
- 窗口恢复 `ready` 状态，可被下一个任务复用
- Chrome 进程持续运行，session cookie 持久化在 userDataDir

### 6.3 手动关闭 Chrome

如需手动关闭 Chrome：

```bash
curl -X POST http://localhost:3200/api/playwright-poc/close \
  -H "Content-Type: application/json" \
  -d '{"windowId":"staff-肖飞"}'
```

---

## 7. 如何只读 V1 测试数据

### 7.1 允许的操作

V2 测试脚本可以**只读** V1 的 `data/settings.json`：

```text
../bnsy-operator/data/settings.json
```

示例脚本：`scripts/seed-test-worker-from-legacy.ts`

```typescript
const LEGACY_ROOT = path.resolve(NEXT_ROOT, '..', 'bnsy-operator');
const LEGACY_SETTINGS = path.join(LEGACY_ROOT, 'data', 'settings.json');
// 只读，不修改
```

### 7.2 严禁的操作

- ❌ V2 业务代码 `import` V1 代码
- ❌ V2 运行时依赖 V1 的 EasyBR / 数据库 / 端口
- ❌ 修改 V1（`bnsy-operator/`）的任何文件
- ❌ V2 向 V1 写入数据

### 7.3 V1/V2 settings.json 隔离

| 项目 | settings.json 路径 |
|------|---------------------|
| V1 | `bnsy-operator/data/settings.json` |
| V2 | `bnsyV2/data/settings.json` |

V2 有自己独立的 settings.json，运行时不读取 V1 的。

---

## 8. 常见问题处理

### Q1: 后端启动报 "EasyBR API 网络错误"

**原因：** legacy_easybr 模式下 BrowserPool 尝试连接 EasyBR（端口 3001），但 EasyBR 未运行。

**处理：**
- 如果要用 Playwright：设置 `WINDOW_RUNTIME_MODE=playwright` 后重启
- 如果要用 EasyBR：先启动 EasyBR 软件
- 忽略：不影响后端启动，只影响窗口操作

### Q2: 后端启动报 "PostgreSQL 不可用"

**原因：** PostgreSQL（端口 5435）未启动。

**处理：**
- 启动 Docker：`docker compose up -d postgres`
- 或忽略：后端降级到 JSON 文件模式（`data/db.json`），功能正常但数据不持久

### Q3: Chrome 没有弹出

**检查：**
1. 后端是否以 `WINDOW_RUNTIME_MODE=playwright` 启动
2. 是否安装了 Playwright 浏览器：`npx playwright install chromium`
3. 系统是否安装了 Chrome 浏览器
4. 查看 POC API 返回的 error 字段

### Q4: Chrome 弹出"是否保存密码"

**已处理：** Phase 2-D-Run 已通过 Chrome args + Preferences 双重禁用密码保存弹窗。

如果仍出现：
- 检查 `backend/playwright-runtime/PlaywrightRuntime.ts` 是否含 `--disable-save-password-bubble`
- 检查 userDataDir 的 `Default/Preferences` 是否含 `credentials_enable_service: false`

### Q5: 任务日志显示 usePlaywright=false

**原因：** 后端未加载新的 allowlist（tsx watch 未热重载 runtimeMode.ts 修改）。

**处理：** 手动重启后端（Ctrl+C 后重新 `npm run dev`）。

### Q6: 窗口状态卡在 busy

**处理：**
1. 查看后端日志确认是否 markReady 未执行
2. 调用 POC API 查看窗口状态：`GET /api/playwright-poc/windows`
3. 必要时手动关闭并重启窗口：`POST /api/playwright-poc/close` → `POST /api/window-adapter-poc/ensure-ready`

### Q7: 如何查看任务日志

```bash
# 内存日志
curl http://localhost:3200/api/operations/<taskId>/logs

# PG 持久化日志
curl http://localhost:3200/api/tasks/<taskId>/logs
```

或前端任务中心 → 任务详情 → 执行日志 Tab。
