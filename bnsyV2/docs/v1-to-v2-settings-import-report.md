# V1 → V2 设置导入报告

> 一次性数据导入：从 V1 旧项目 settings.json 合并到 V2 设置中心
> 日期：2026-06-27 15:26:43
> 模式：--apply（已写入）

---

## 1. 是否修改 V1

**否。** 只读 V1 settings.json，未做任何写入。

## 2. V1 settings 路径

```text
E:\网站开发\网点系统自动化\bnsy-operator\data\settings.json
```

## 3. V2 settings 路径

```text
E:\网站开发\网点系统自动化\bnsyV2\data\settings.json
```

## 4. 是否创建备份

**是。** 备份路径：

```text
E:\网站开发\网点系统自动化\bnsyV2\data\settings.backup.2026-06-27T15-26-43.json
```

## 5. 导入网点数量

- 新增网点：1
- 更新网点：1
- V2 当前网点总数：2

## 6. 导入员工/窗口数量

- 新增员工/窗口：4
- 更新员工/窗口：0
- 未变化员工/窗口：1
- V2 当前员工/窗口总数：5

## 7. 每个网点员工列表（账号脱敏）

### 天南大（site-1782121346155）— updated

| 员工 | 脱敏账号 | 窗口名 | 操作 | 密码 | easybrBrowserId | 推荐 windowId |
|------|---------|--------|------|------|----------------|--------------|
| 孟德海 | 022****0006 | 天南大-孟德海 | added | 存在 | 6a37866f5f9fe9426023e75d | staff-孟德海 |
| 刘磊 | 022****0007 | 天南大-刘磊 | added | 存在 | 6a3786705f9fe9426023e75e | staff-刘磊 |
| 肖飞 | 022****0008 | 天南大-肖飞 | unchanged | 存在 | 6a37866f5f9fe9426023e75c | staff-肖飞 |
| 罗晓红 | 022****0003 | 天南大-罗晓红 | added | 存在 | 6a3df1965f9fe9426023f842 | staff-罗晓红 |

### 和苑（site-1782383603651）— added

| 员工 | 脱敏账号 | 窗口名 | 操作 | 密码 | easybrBrowserId | 推荐 windowId |
|------|---------|--------|------|------|----------------|--------------|
| 肖文勇 | 022****6004 | 和苑-肖文勇 | added | 存在 | 6a3d06355f9fe9426023f703 | staff-肖文勇 |

## 8. 密码是否未泄露

**是。** 本脚本和报告中：
- 禁止打印明文密码
- 禁止打印 Base64 密码原文
- 只输出 `passwordExists: true/false`
- 密码字段（Base64）直接复制到 V2 settings.json，不经过日志

## 9. easybrBrowserId 是否保留

- 保留 easybrBrowserId 的员工数：5
  - 孟德海: 6a37866f5f9fe9426023e75d
  - 刘磊: 6a3786705f9fe9426023e75e
  - 肖飞: 6a37866f5f9fe9426023e75c
  - 罗晓红: 6a3df1965f9fe9426023f842
  - 肖文勇: 6a3d06355f9fe9426023f703

## 10. V2 推荐 windowId

Playwright 模式下推荐 windowId 命名规则：`staff-${employeeName}`

| 员工 | 推荐 windowId |
|------|--------------|
| 孟德海 | staff-孟德海 |
| 刘磊 | staff-刘磊 |
| 肖飞 | staff-肖飞 |
| 罗晓红 | staff-罗晓红 |
| 肖文勇 | staff-肖文勇 |

## 11. 是否保留 V2 initialized / pinHash / pinSalt / runtime

**是。** 合并时只更新 `sites`，以下字段全部保留 V2 原值：

- initialized: true
- pinHash: (已设置，已保留)
- pinSalt: (已设置，已保留)
- runtime: {"dryRunMode":true}

## 12. 是否建议打开 V2 设置中心检查

**是。** 建议导入后：
1. 打开 V2 前端设置中心，确认网点/员工列表正确
2. 调用 `GET /api/sites/:siteId/playwright-windows` 确认导入员工出现在窗口列表
3. 可选择测试一个员工 `POST /api/sites/:siteId/playwright-windows/ensure`（需用户确认，会打开真实 Chrome）

---

## 通过标准对照

| # | 通过标准 | 结果 |
|---|---------|------|
| 1 | V1 未修改 | ✅ 只读 |
| 2 | V2 settings.json 已备份 | ✅ |
| 3 | V1 网点导入到 V2 | ✅ |
| 4 | V1 员工/窗口导入到 V2 | ✅ |
| 5 | V2 原有全局字段保留 | ✅ initialized/pinHash/pinSalt/runtime 全保留 |
| 6 | 账号脱敏输出 | ✅ 022****0008 格式 |
| 7 | 密码未打印 | ✅ 只输出 passwordExists |
| 8 | V2 设置中心刷新后能看到导入员工 | ☐ 待人工确认 |
| 9 | GET /api/sites/:siteId/playwright-windows 能看到导入员工 | ☐ 待人工确认 |
| 10 | 没有修改业务代码 | ✅ 仅修改 data/settings.json |
