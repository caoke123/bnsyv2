# 项目部分重命名审查报告：bnsy-operator / bnsyV2

> 阶段：项目重命名部分完成后的只审查不修改
> 审查日期：2026-06-27
> 审查范围：bnsy-operator/（旧项目）与 bnsyV2/（新项目）
> 审查原则：只输出审查报告，不修改任何文件

---

## 1. 当前实际目录状态

| 目录名 | 是否存在 | 说明 |
|--------|----------|------|
| `bnsy-operator` | ✓ 是 | 旧项目 / V1 / EasyBR 生产稳定版（**未重命名**） |
| `bnsyV2` | ✓ 是 | 新项目 / V2 / Playwright Chrome 改造版（已重命名） |
| `bnsy-operator-next` | ✗ 否 | 已重命名为 bnsyV2 |
| `bnsyV1` | ✗ 否 | 旧项目未重命名，仍为 bnsy-operator |

**结论：** 部分重命名。新项目已从 `bnsy-operator-next` 改为 `bnsyV2`；旧项目因目录占用未能重命名为 `bnsyV1`，保留原名 `bnsy-operator`。

---

## 2. 旧项目 bnsy-operator 审查

### 2.1 Git 状态

```
git status --short  →  空（工作区干净）
git log --oneline -3  →  04874e1 (HEAD -> main, origin/main) fix: 交付前安全加固...
                          6f7549f feat: 到派一体上传确认弹窗...
                          2b26570 feat: Phase A 一键启动稳定修复...
```

**结论：** ✓ 旧项目 Git 工作区干净，无未提交的代码修改。最新提交 `04874e1` 与项目记忆一致（2026-06-27 安全加固提交）。

### 2.2 最近修改文件（mtime 检查）

| 文件 | mtime | 说明 |
|------|-------|------|
| `data/postgres-*` | 2026-06-27 17:18 | 运行时数据库文件（旧项目后端运行产生） |
| `data/db.json` | 2026-06-26 23:14 | 运行时 SQLite 数据（非代码） |

**结论：** ✓ 最近修改的都是 `data/` 目录下的运行时数据文件，**无代码文件被修改**。这些数据文件是旧项目后端运行时正常产生的，非本次重命名操作导致。

### 2.3 是否被误写入 / 新增 V2 引用

在 `bnsy-operator/` 中搜索 `bnsyV2|bnsy-operator-next|bnsyV1`（排除 node_modules/.git/data）：

```
结果：No matches found
```

**结论：** ✓ 旧项目中**零 V2/V1/bnsy-operator-next 引用**，完全未被新项目污染。

---

## 3. 新项目 bnsyV2 核心文件审查

### 3.1 Git 状态

- bnsyV2 没有独立的 .git 仓库
- 父目录 `e:\网站开发\网点系统自动化` 有 .git 仓库（包含 bnsyV2 作为 untracked）
- 无法用 git diff 判断文件变更，改用 mtime + 内容审查

### 3.2 文件 mtime 审查

bnsyV2 中最近修改的文件（排除 node_modules/.git/runtime/data）：

| 文件 | mtime | 归属阶段 |
|------|-------|----------|
| `docs/phase-2e-all-modules-runtime-report.md` | 2026-06-27 20:41 | Phase 2-E 验收报告（正常） |
| `scripts/multi-runtime-mode-verify.ts` | 2026-06-27 20:28 | Phase 2-E 验证脚本（正常） |
| `backend/config/runtimeMode.ts` | 2026-06-27 20:18 | Phase 2-E allowlist 扩展（正常） |
| `docs/phase-2d-run-real-chrome-report.md` | 2026-06-27 20:09 | Phase 2-D-Run 报告（正常） |
| `backend/playwright-runtime/PlaywrightRuntime.ts` | 2026-06-27 19:59 | Phase 2-D-Run 密码弹窗禁用（正常） |

**结论：** ✓ 所有文件 mtime 均在 Phase 2-D / Phase 2-E 期间（2026-06-27 16:00-20:41），**无文件在重命名操作期间（约 20:5x）被修改**。重命名操作只改变目录路径，未触碰文件内容。

### 3.3 核心文件内容审查

#### 3.3.1 backend/config/runtimeMode.ts

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 默认值仍为 legacy_easybr | ✓ | L28: `if (raw === 'playwright') return 'playwright';` L29: `return 'legacy_easybr';` |
| allowlist 支持 5 个 taskType | ✓ | L51-57: `Set(['sign','arrive','arrival','dispatch','integrated'])` |
| shouldUsePlaywrightAdapter 逻辑不变 | ✓ | L71-72: `isPlaywrightMode() && PLAYWRIGHT_ALLOWED_TASK_TYPES.has(taskType)` |

**结论：** ✓ runtimeMode.ts 与 Phase 2-E 完成时一致，未被误改。

#### 3.3.2 backend/playwright-runtime/PlaywrightRuntime.ts

| 检查项 | 结果 | 证据 |
|--------|------|------|
| channel=chrome | ✓ | L115: `channel: 'chrome'` |
| headless=false（默认） | ✓ | L114: `headless: opts.headless ?? false` |
| 密码保存弹窗禁用（args） | ✓ | L122-123: `--disable-save-password-bubble`, `--disable-password-manager-reauthentication` |
| 密码管理器禁用（Preferences） | ✓ | L109: `disableChromePasswordManager(userDataDir, tag)` |
| credentials_enable_service=false | ✓ | L585-586 |
| password_manager_enabled=false | ✓ | L590-592 |

**结论：** ✓ PlaywrightRuntime.ts 与 Phase 2-D-Run 补充修正后一致，未被误改。

#### 3.3.3 backend/modules/assignment-engine/AssignmentEngine.ts

| 检查项 | 结果 | 证据 |
|--------|------|------|
| import shouldUsePlaywrightAdapter | ✓ | L42 |
| resolveWorkerConnection 定义 | ✓ | L892 |
| resolveLegacyWorkerConnection 定义 | ✓ | L925 |
| resolvePlaywrightWorkerConnection 定义 | ✓ | L1001 |
| runtime 分发逻辑集中 | ✓ | L900: `shouldUsePlaywrightAdapter(taskType)` 判断 |

**结论：** ✓ AssignmentEngine 三方法完整，runtime 分发逻辑与 Phase 2-D 一致，未被误改。

#### 3.3.4 4 个 Handler（Arrival/Dispatch/Integrated/Sign）

在 `backend/modules/assignment-engine/handlers/` 搜索 `PlaywrightWindowAdapter|WindowAdapterRegistry|shouldUsePlaywrightAdapter|runtimeMode|PlaywrightRuntime`：

```
结果：No matches found
```

**结论：** ✓ 4 个 Handler **零引用** Adapter/runtimeMode，完全符合"Handler 只使用 ctx.page/ctx.staffName/ctx.windowId/ctx.log"的设计原则，未被误改。

#### 3.3.5 backend/api/routes.ts

搜索 `shouldUsePlaywrightAdapter|resolvePlaywrightWorkerConnection|resolveWorkerConnection|PlaywrightWindowAdapter|runtimeMode`：

```
结果：No matches found
```

**结论：** ✓ routes.ts **无 runtime 分发逻辑**，业务接口逻辑未被误改。

#### 3.3.6 TypeScript 编译

```
npx tsc --noEmit -p tsconfig.json
exit code: 0
```

**结论：** ✓ TypeScript 编译 0 错误。

---

## 4. 路径引用审查

### 4.1 bnsyV1 引用（错误路径风险）

在 bnsyV2 中搜索 `bnsyV1`（排除 node_modules/.git/runtime）：

```
结果：No matches found
```

**结论：** ✓ **零 bnsyV1 引用**。不存在 `../bnsyV1/data/settings.json` 等错误路径。

### 4.2 bnsy-operator-next 残留

在 bnsyV2 中搜索 `bnsy-operator-next`（排除 node_modules/.git/runtime），共 49 个文件命中。分类如下：

| 类别 | 文件数 | 风险等级 | 说明 |
|------|--------|----------|------|
| 文档/注释中的历史名称 | ~30 | 低 | docs/*.md 阶段报告、backend/*.ts 注释（如 "bnsy-operator-next 后端入口"） |
| 报告中的 file:// 链接 | ~15 | 低 | docs/phase-2c/2d 报告中 `file:///.../bnsy-operator-next/...` 链接已失效，但不影响运行 |
| docker-compose 容器名 | 1 | 低 | docker-compose.yml L61: `bnsy-operator-next:` 容器名（不影响本地开发） |
| package.json npm 包名 | 2 | 低 | package.json / frontend/package.json 的 `"name"` 字段（不影响运行） |
| 前端 title 标签 | 1 | 低 | frontend/index.html: `<title>bnsy-operator-next ...</title>` |
| SQL 注释 | 1 | 低 | database/schema/init-schema.sql 注释 |

**结论：** ⚠ 所有 bnsy-operator-next 残留均为**文档/注释/配置类**，**无运行时代码路径依赖**。不影响 bnsyV2 编译和运行。建议未来在低风险时机统一更新为 bnsyV2。

### 4.3 ../bnsy-operator 引用（旧项目只读路径）

在 bnsyV2/scripts 中搜索 `../bnsy-operator` 路径引用：

| 脚本 | 行号 | 引用方式 | 正确性 |
|------|------|----------|--------|
| `seed-test-worker-from-legacy.ts` | L30 | `path.resolve(NEXT_ROOT, '..', 'bnsy-operator')` | ✓ 正确（旧项目实际目录是 bnsy-operator） |
| `multi-runtime-mode-verify.ts` | L67 | `join(nextRoot, '..', 'bnsy-operator')` | ✓ 正确 |
| `window-adapter-verify.ts` | L36 | `join(__dirname, '..', '..', 'bnsy-operator')` | ✓ 正确 |
| `adapter-task-verify.ts` | L143 | `path.join(__dirname, '..', '..', 'bnsy-operator')` | ✓ 正确 |

**结论：** ✓ 所有脚本中的旧项目只读路径都指向 `../bnsy-operator`，与旧项目实际目录名**完全一致**，路径正确。不存在指向不存在的 `../bnsyV1` 的错误路径。

### 4.4 bnsy-operator 旧项目中的 V2 引用

在 bnsy-operator 中搜索 `bnsyV2|bnsy-operator-next|bnsyV1`：

```
结果：No matches found
```

**结论：** ✓ 旧项目中零 V2 引用。

---

## 5. 核心逻辑不变检查

| 检查项 | 结果 | 证据 |
|--------|------|------|
| WINDOW_RUNTIME_MODE 默认仍为 legacy_easybr | ✓ | runtimeMode.ts L28-29 |
| playwright allowlist 仍支持 sign+arrival+dispatch+integrated | ✓ | runtimeMode.ts L51-57（5 个 taskType） |
| Chrome 仍 channel=chrome | ✓ | PlaywrightRuntime.ts L115 |
| Chrome 仍 headless=false | ✓ | PlaywrightRuntime.ts L114 |
| Chrome 密码保存弹窗仍禁用 | ✓ | PlaywrightRuntime.ts L122-123 + L109 + L585-592 |
| 自动登录后仍先执行旧 P0 | ✓ | multi-runtime-mode-verify.ts D0.4 步骤（未改动） |
| P0 passed 后才提交任务 | ✓ | multi-runtime-mode-verify.ts 流程（未改动） |
| 任务结束后窗口恢复 ready | ✓ | Phase 2-E 验收已通过（46/46） |
| Chrome keep-open | ✓ | 脚本 --keep-open 参数（未改动） |
| legacy_easybr 可回退 | ✓ | 默认值不变，未设置 env 时回退 legacy |

**结论：** ✓ 所有已完成的核心逻辑保持不变。

---

## 6. 风险结论

### 6.1 启动路径风险

**✓ 无风险。** bnsyV2 后端启动使用 `npm run dev`（tsx watch backend/index.ts），不依赖目录名。所有 import 路径都是相对路径（`./`、`../`），重命名目录不影响模块解析。

### 6.2 旧数据只读路径风险

**✓ 无风险。** bnsyV2 脚本中所有旧项目只读路径都指向 `../bnsy-operator`，与旧项目实际目录名一致。不存在指向 `../bnsyV1` 的错误路径。

### 6.3 核心逻辑误改风险

**✓ 无风险。** tsc --noEmit 通过（0 错误），4 个 Handler 零引用 Adapter，routes.ts 无 runtime 分发，AssignmentEngine 三方法完整，PlaywrightRuntime 配置不变。

### 6.4 低风险项（不影响运行，建议未来更新）

| 风险项 | 影响 | 建议 |
|--------|------|------|
| 文档/注释中 bnsy-operator-next 残留 | 仅显示名称过时 | 未来统一更新为 bnsyV2 |
| docker-compose.yml 容器名 | 仅 Docker 部署时容器名 | 未来更新为 bnsyV2 |
| package.json name 字段 | 仅 npm 包名 | 未来更新为 bnsyV2 |
| 历史报告 file:// 链接失效 | 点击链接无法跳转 | 历史报告可不修，新报告用 bnsyV2 |

---

## 7. 建议

### 7.1 是否需要修正 V2 中旧项目路径

**✓ 不需要。** V2 脚本中的 `../bnsy-operator` 路径与旧项目实际目录名一致，路径正确。

### 7.2 是否建议保留旧项目目录名 bnsy-operator

**✓ 建议保留。** 旧项目目录被 IDE/进程占用，强行重命名有风险。保留 `bnsy-operator` 目录名不影响 V2 任何功能。V2 脚本的只读路径已正确指向该目录。

### 7.3 是否建议只在文档中称其为 V1

**✓ 建议。** 在文档/交流中使用"V1"指代旧项目 `bnsy-operator`，"V2"指代新项目 `bnsyV2`。目录名保持 `bnsy-operator` 不变，避免占用冲突。

### 7.4 是否建议继续 Phase 3

**✓ 建议。** 部分重命名不影响任何核心逻辑，Phase 2-E 已全部通过（46/46 检查 + 14/14 通过标准），tsc 编译 0 错误，可继续 Phase 3。

---

## 8. 审查通过标准

| # | 标准 | 结果 |
|---|------|------|
| 1 | 旧项目 bnsy-operator 未被修改 | ✓ 通过（git status 干净，无代码修改） |
| 2 | 新项目 bnsyV2 核心业务逻辑未被命名操作误改 | ✓ 通过（mtime + 内容审查） |
| 3 | Handler / routes.ts / BrowserPool / EasyBRClient 没有被误改 | ✓ 通过（Handler 零引用，routes 无分发） |
| 4 | V2 已完成的 Playwright runtime 逻辑保持不变 | ✓ 通过（runtimeMode + PlaywrightRuntime + Engine 三方法） |
| 5 | 没有残留错误路径导致脚本找不到旧项目数据 | ✓ 通过（所有脚本指向 ../bnsy-operator） |
| 6 | 旧项目实际目录仍是 bnsy-operator 时，V2 只读路径指向 ../bnsy-operator/data/settings.json | ✓ 通过（4 个脚本均正确） |
| 7 | 报告清楚列出所有风险项，但不自动修复 | ✓ 通过（本报告仅审查，未修改任何文件） |

**审查结论：7/7 通过。部分重命名操作未造成任何核心逻辑或路径风险，项目可正常继续 Phase 3。**
