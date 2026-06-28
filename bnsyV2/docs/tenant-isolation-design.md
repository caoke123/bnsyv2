# 租户隔离设计（Tenant Isolation Design）

> 多会员系统下的资源隔离设计草案。

## 一、隔离维度

| 资源 | 隔离方式 |
| --- | --- |
| 窗口（Window） | `tenant_id` 字段 + Playwright profile 分目录 |
| 员工（Employee） | `tenant_id` 字段 |
| 任务（Task） | `tenant_id` 字段 |
| 日志（Log） | `tenant_id` 字段 + 日志文件分目录 |
| 浏览器 profile | `runtime/profiles/<tenantId>/` |
| 截图 | `runtime/screenshots/<tenantId>/` |
| 日志文件 | `runtime/logs/<tenantId>/` |
| 下载 | `runtime/downloads/<tenantId>/` |

## 二、数据模型草案

```sql
-- 租户表
CREATE TABLE tenants (
  id          UUID PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 用户表（会员账号）
CREATE TABLE users (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  username     VARCHAR(50) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, username)
);

-- 现有 windows / employees / tasks / logs 表新增：
ALTER TABLE windows   ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE employees ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE tasks     ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE task_logs ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
```

## 三、后端中间件草案

```typescript
// backend/api/middleware/tenantContext.ts（待实现）

export interface TenantContext {
  tenantId: string;
  userId: string;
}

// 从 JWT 或 Session 中解析 tenantId，挂到 req 上
export function tenantContextMiddleware(req, res, next) {
  const ctx = resolveFromAuth(req);
  if (!ctx) return res.status(401).end();
  req.tenant = ctx;
  next();
}
```

## 四、查询约束

- 所有数据访问层（DAO / Repository）必须接受 `tenantId` 参数。
- 所有 SQL 查询必须追加 `WHERE tenant_id = $1`。
- 严禁跨租户查询，除非显式声明为管理后台操作。

## 五、本阶段约束

- 本阶段**仅设计**，不实现。
- 不修改现有数据库 schema。
- 不修改现有数据访问层。
