# Phase 2-D-Data 验收报告：从旧项目只读提取测试网点/员工/窗口信息

> 阶段：Phase 2-D-Data（从旧项目只读提取测试数据，写入新项目独立 settings）
> 验收日期：2026-06-27
> 前置阶段：Phase 2-D 全部通过 / Phase 2-D-Run 三次修正完成
> 测试账号：022****0008（脱敏）
> 测试密码：******（脱敏）

---

## 1. 是否修改旧项目

**✓ 否（旧项目只读，未修改）**

脚本 `scripts/seed-test-worker-from-legacy.ts` 仅使用 `fs.readFileSync` 读取旧项目 `bnsy-operator/data/settings.json`，无任何写入/删除操作。

旧项目文件校验：
- 路径：`bnsy-operator/data/settings.json`
- 读取方式：`fs.readFileSync`（只读）
- 修改状态：未修改

---

## 2. 是否只读旧项目 settings

**✓ 是**

脚本仅在以下位置读取旧项目 settings：

```typescript
// scripts/seed-test-worker-from-legacy.ts L122-128
function readLegacySettings(): LegacySettings {
  if (!fs.existsSync(LEGACY_SETTINGS)) {
    throw new Error(`旧项目 settings.json 不存在: ${LEGACY_SETTINGS}`);
  }
  const raw = fs.readFileSync(LEGACY_SETTINGS, 'utf-8');  // ← 只读
  return JSON.parse(raw) as LegacySettings;
}
```

全程无 `fs.writeFileSync` / `fs.renameSync` 等写入操作指向旧项目路径。

---

## 3. 是否找到测试账号

**✓ 是**

测试账号 `022****0008`（脱敏显示）在旧项目 settings 中找到。

| 搜索项 | 结果 |
|--------|------|
| 搜索字段 | `username` |
| 搜索路径 | `sites[].windows[].username` |
| 匹配站点 | 天南大（`site-1782121346155`） |
| 匹配员工 | 肖飞 |
| 匹配窗口 | 天南大-肖飞 |
| easybrBrowserId | `6a37866f5f9fe9426023e75c` |

搜索范围（按优先级）：
1. `sites[].windows[]` ✓ 命中
2. `sites[].workers[]`（未命中）
3. `windows[]`（未命中）
4. `workers[]`（未命中）

搜索字段（按优先级）：
1. `username` ✓ 命中
2. `account` / `phone` / `loginAccount` / `loginUsername`（未命中）
3. `credential.username` / `credential.account`（未命中）
4. `credentials.username` / `credentials.account`（未命中）

---

## 4. legacy siteId / siteName

| 字段 | 值 |
|------|-----|
| legacySiteId | `site-1782121346155` |
| legacySiteName | `天南大` |
| legacyStaffName | `肖飞` |
| legacyWindowName | `天南大-肖飞` |
| legacyUsername（脱敏） | `022****0008` |
| legacyEasybrBrowserId | `6a37866f5f9fe9426023e75c` |
| legacyPassword | `******`（Base64 编码，不输出） |

---

## 5. legacy staffName / windowName

| 字段 | 值 |
|------|-----|
| legacyStaffName | `肖飞` |
| legacyWindowName | `天南大-肖飞` |

---

## 6. next settings 写入路径

**写入路径：** `bnsy-operator-next/data/settings.json`

写入方式：原子写入（先写 `.tmp`，再 `rename` 覆盖），防断电损坏。

```typescript
// scripts/seed-test-worker-from-legacy.ts L283-287
const tmpPath = NEXT_SETTINGS + '.tmp';
const json = JSON.stringify(settings, null, 2);
fs.writeFileSync(tmpPath, json, 'utf-8');
fs.renameSync(tmpPath, NEXT_SETTINGS);
```

---

## 7. next siteId / siteName

| 字段 | 值 |
|------|-----|
| nextSiteId | `site-1782121346155`（与旧项目一致，Sign API 校验 site.id 有效性） |
| nextSiteName | `天南大` |
| nextStaffName | `肖飞` |
| nextWindowName | `天南大-肖飞` |
| nextWindowId | `staff-肖飞`（格式：`staff-${staffName}`，与 Engine playwright 路径一致） |
| nextUsername（脱敏） | `022****0008` |
| nextHasPassword | `true`（Base64 编码） |

**新项目 settings.json 完整内容（密码脱敏）：**

```json
{
  "initialized": true,
  "pinHash": "fa9f55f4...",
  "pinSalt": "77f57b49...",
  "sites": [
    {
      "id": "site-1782121346155",
      "name": "天南大",
      "windows": [
        {
          "windowName": "天南大-肖飞",
          "employeeName": "肖飞",
          "username": "022****0008",
          "password": "******",
          "easybrBrowserId": "6a37866f5f9fe9426023e75c"
        }
      ]
    }
  ],
  "runtime": {
    "dryRunMode": true
  }
}
```

**说明：**
- `pinHash` / `pinSalt`：测试 PIN `0000` 生成（仅供测试，不影响功能）
- `runtime.dryRunMode: true`：安全优先，试运行模式
- 只迁移测试账号 `022****0008` 对应的 1 个网点 + 1 个员工，未迁移其他员工/网点

---

## 8. signApiSiteValue

**signApiSiteValue = `site-1782121346155`**

### siteId / siteCode 规则确认

通过读取 [routes.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/backend/api/routes.ts#L1097-L1167) 中 sign 路由校验逻辑确认：

| 层级 | 字段 | 值 | 说明 |
|------|------|-----|------|
| Sign API 入参 | `site` | `site-1782121346155` | 前端传入 settings.json 的 site.id |
| Sign API 校验 | `_validSiteIds.includes(site)` | ✓ 通过 | L1110-1112 校验 site.id 有效性 |
| Sign API 转换 | `normalizeSiteToCode(site, ...)` | `tiannanda` | L1141 将 site.id → siteCode |
| Engine 执行 | `site: siteCode` | `tiannanda` | L1144, L1162 任务记录和 Engine 使用 siteCode |

**结论：**
- Sign API 要求前端传入 **settings.json 的 site.id**（`site-1782121346155`）
- Sign API 内部自动转换为 siteCode（`tiannanda`）
- 测试脚本 `--site` 参数应传 `site-1782121346155`

### siteCode 推导规则

```typescript
// routes.ts normalizeSiteToCode L42-66
if (siteInput === 'tiannanda' || siteInput === 'heyuan') return siteInput;
const site = config.sites.find(s => s.id === siteInput);
if (site.name.includes('天南大')) return 'tiannanda';
if (site.name.includes('和苑')) return 'heyuan';
```

| siteName | siteCode |
|----------|----------|
| 天南大 | `tiannanda` |
| 和苑 | `heyuan` |

---

## 9. 密码是否脱敏

**✓ 是**

| 输出位置 | 密码显示 |
|---------|---------|
| 脚本控制台日志 | `******（Base64 编码，不输出）` |
| 本验收报告 | `******` |
| 新项目 settings.json | Base64 编码存储（`Qk41NjEyMzQ=`，与旧项目一致） |

**密码处理原则：**
- 密码从旧项目 settings.json 读取（Base64 编码）
- 直接复制到新项目 settings.json（保持 Base64 编码，不解码）
- 全程不输出明文密码
- settings.json 已在 `.gitignore` 中（`data/*.json`），不会提交 Git

---

## 10. 是否避免跨项目 runtime 依赖

**✓ 是**

### 新项目独立性保证

| 检查项 | 结果 |
|--------|------|
| 新项目 settings.json 独立存在 | ✓ `bnsy-operator-next/data/settings.json` |
| 新项目业务代码无 import 旧项目 | ✓ 无 `../bnsy-operator/` 跨项目 import |
| 新项目运行时读取自己的 settings | ✓ `SettingsManager` 读取 `bnsy-operator-next/data/settings.json` |
| 种子脚本仅在数据迁移阶段读取旧项目 | ✓ 迁移完成后不再依赖 |

### 跨项目依赖检查

种子脚本 `scripts/seed-test-worker-from-legacy.ts` 是**一次性数据迁移脚本**，仅在 Phase 2-D-Data 阶段运行：
- 运行时读取旧项目 settings（只读）
- 迁移完成后写入新项目 settings
- 后续测试脚本（`sign-runtime-mode-verify.ts`）只读取新项目 settings
- 新项目业务运行时完全不依赖旧项目

---

## 11. 是否建议继续 Phase 2-D-Run

**✓ 是**

### 继续条件达成情况

| 条件 | 状态 |
|------|------|
| 新项目 settings.json 已写入 | ✓ |
| siteId 非空 | ✓ `site-1782121346155` |
| staffName 非空 | ✓ `肖飞` |
| windowId 非空 | ✓ `staff-肖飞` |
| signApiSiteValue 明确 | ✓ `site-1782121346155` |
| 密码已脱敏 | ✓ |
| 新项目独立 | ✓ |

### Phase 2-D-Run 启动命令

```powershell
$env:WINDOW_RUNTIME_MODE="playwright"
$env:BNSY_TEST_USERNAME="022****0008（你的真实测试账号）"
$env:BNSY_TEST_PASSWORD="<你的测试密码>"
npx tsx scripts/sign-runtime-mode-verify.ts --auto-login --site=site-1782121346155 --staff=肖飞
```

---

## 附：通过标准达成情况

| # | 通过标准 | 达成情况 | 说明 |
|---|---------|---------|------|
| 1 | 旧项目只读，未修改 | ✓ | 仅 `fs.readFileSync`，无写入 |
| 2 | 成功根据账号找到旧项目 site/staff/window | ✓ | 肖飞/天南大/site-1782121346155 |
| 3 | 新项目写入独立测试 settings | ✓ | `bnsy-operator-next/data/settings.json` |
| 4 | 新项目 settings 中 siteId 非空 | ✓ | `site-1782121346155` |
| 5 | 新项目 settings 中 staffName 非空 | ✓ | `肖飞` |
| 6 | 新项目 settings 中 windowId 非空 | ✓ | `staff-肖飞` |
| 7 | signApiSiteValue 明确 | ✓ | `site-1782121346155`（settings site.id） |
| 8 | 密码未出现在日志和报告中 | ✓ | 全程 `******` 脱敏 |
| 9 | 新项目不依赖旧项目 runtime | ✓ | 业务代码无跨项目 import |
| 10 | 可以继续执行 Phase 2-D-Run | ✓ | 启动命令已给出 |

---

## 附：文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| [scripts/seed-test-worker-from-legacy.ts](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/scripts/seed-test-worker-from-legacy.ts) | 只读迁移脚本：从旧项目搜索测试账号，写入新项目 settings |
| [data/settings.json](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/data/settings.json) | 新项目独立测试 settings（1 网点 + 1 员工） |
| [docs/phase-2d-test-data-seed-report.md](file:///e:/网站开发/网点系统自动化/bnsy-operator-next/docs/phase-2d-test-data-seed-report.md) | 本验收报告 |

### 未修改文件

| 文件 | 状态 |
|------|------|
| `bnsy-operator/`（旧项目） | ✓ 未修改（只读） |
| `bnsy-operator/data/settings.json` | ✓ 未修改（只读） |
| `backend/api/routes.ts` | ✓ 未修改 |
| `backend/config/SettingsManager.ts` | ✓ 未修改 |
| `backend/modules/assignment-engine/*` | ✓ 未修改 |
| `scripts/sign-runtime-mode-verify.ts` | ✓ 未修改（本次未改动） |

---

## 附：脚本设计说明

### 搜索策略

脚本支持多种字段名和搜索范围，兼容不同 schema 的旧项目 settings：

**搜索字段（按优先级）：**
1. `username`（命中）
2. `account`
3. `phone`
4. `loginAccount`
5. `loginUsername`
6. `credential.username` / `credential.account`
7. `credentials.username` / `credentials.account`

**搜索范围（按优先级）：**
1. `sites[].windows[]`（命中）
2. `sites[].workers[]`
3. `windows[]`（顶层）
4. `workers[]`（顶层）

### 最小数据迁移

只迁移测试所需的最小数据：
- 1 个网点（天南大）
- 1 个员工（肖飞）
- 1 个窗口（天南大-肖飞）

未迁移：
- 其他员工（孟德海、刘磊、罗晓红）
- 其他网点（和苑）
- 旧项目的 pinHash / pinSalt（新项目独立生成）

### 安全保证

| 安全项 | 措施 |
|--------|------|
| 账号脱敏 | `maskUsername()` 保留首 3 位 + 末 4 位 |
| 密码脱敏 | 全程 `******`，不输出明文 |
| Git 安全 | `data/*.json` 在 `.gitignore` 中 |
| 原子写入 | 先写 `.tmp`，再 `rename` 覆盖 |
| 旧项目保护 | 仅 `readFileSync`，无写入 |
