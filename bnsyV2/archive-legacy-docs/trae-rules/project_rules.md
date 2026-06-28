# 项目开发规范

## Admin 依赖冻结（Phase B-3C）

> 生效时间：Phase B-3C
> 状态：**冻结中**，Phase C 将逐步退役

### 禁止新增的依赖

以下 API / 模式已冻结，**禁止在新代码中调用**：

```ts
// ❌ 禁止新增调用
BrowserPool.getInstance().getAdminPage(site)
BrowserPool.getInstance().getAdminConnection(site)
Database.getInstance().getAdminWindow(site)

// ❌ 禁止新增判断条件
if (windowInfo.role === 'admin') { ... }
windowInfo.role === 'admin'
```

### 替代方案

```ts
// ✅ 使用 getStaffConnection
const conn = await pool.getStaffConnection(staffName);

// ✅ 使用 getStaffWindow
const win = db.getStaffWindow(staffName);
```

### 退役路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase B-3C | 标注 @deprecated，冻结依赖 | **进行中** |
| Phase C-1 | Arrival 迁移到 getStaffConnection | 待执行 |
| Phase C-2 | 删除 getAdminPage / getAdminConnection | 待执行 |
| Phase C-3 | 删除 role 字段 | 待执行 |

### 架构方向

系统正在从 `Admin Pool + Staff Pool` 迁移到统一的 `Worker Pool` 模型。

所有窗口统一视为 Worker Window，不再区分 admin / staff 角色。
