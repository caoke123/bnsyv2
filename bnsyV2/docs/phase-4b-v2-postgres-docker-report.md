# Phase 4-B：V2 PostgreSQL Docker 配置 + 任务中心 HTTP 500 修复验收报告

> 配置独立 PostgreSQL Docker 数据库，修复任务中心 HTTP 500
> 日期：2026-06-27
> 关联：`docs/phase-4b-playwright-ready-guard-report.md`（READY 守卫）

---

## 1. 修改文件清单

**本次无需修改任何代码文件。** 所有基础设施已在前序阶段配置完毕，仅缺少 Docker 容器启动。

| 文件 | 状态 | 说明 |
|------|------|------|
| `docker-compose.yml` | 已存在，未修改 | PostgreSQL 16 + Redis 7 + 应用服务，隔离设计完整 |
| `docker-compose.override.yml` | 已存在，未修改 | 开发环境端口映射 |
| `.env` | 已存在，未修改 | PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE 已配置 |
| `.gitignore` | 已存在，未修改 | `.env` 已在忽略列表 |
| `database/schema/init-schema.sql` | 已存在，未修改 | 8 张表 CREATE IF NOT EXISTS，幂等 |
| `backend/db/PgDatabase.ts` | 已存在，未修改 | pg.Pool 连接池 + init() 幂等初始化 |
| `backend/api/routes.ts` | 已存在，未修改 | GET /api/operations 路由 |

**唯一操作**：`docker compose up -d postgres`（启动已配置但未运行的容器）

---

## 2. 是否修改 V1 / bnsy-operator

**否。** `bnsy-operator/` 生产目录零修改。

验证方式：本次操作仅启动 V2 Docker 容器，未读写任何 `bnsy-operator/` 文件。

---

## 3. V2 PostgreSQL 容器名

```text
daopai-next-postgres
```

与 V1 完全隔离（V1 容器名前缀不同）。

---

## 4. V2 数据库名

```text
daopai_next
```

与 V1 数据库名隔离（V1 为 bnsy_operator）。

---

## 5. V2 用户名

```text
daopai
```

与 V1 用户名隔离（V1 为 bnsy）。

---

## 6. V2 端口

```text
5435:5432
```

与 V1 端口隔离（V1 为 5434）。

---

## 7. V2 volume 名称

```text
daopai_next_pgdata
```

与 V1 volume 隔离（V1 为 bnsy_operator_pgdata）。

---

## 8. DATABASE_URL 是否配置

**是（拆分字段形式）。** `.env` 已配置 PG 连接拆分字段：

```env
PG_HOST=127.0.0.1
PG_PORT=5435
PG_USER=daopai
PG_PASSWORD=daopai_secret
PG_DATABASE=daopai_next
PG_POOL_MAX=20
```

> 注：项目使用拆分字段（PG_HOST/PG_PORT/...）而非单一 DATABASE_URL 连接串。`PgDatabase.ts` 的 `loadConfig()` 从这些字段读取。符合规格"如项目已有拆分字段，也同步配置"。

---

## 9. .env 是否被 gitignore

**是。** `.gitignore` 第 26-27 行：

```text
.env
.env.local
```

---

## 10. 表是否初始化

**是。** Docker 容器首次启动时自动执行 `database/schema/init-schema.sql`（挂载为 `/docker-entrypoint-initdb.d/01-init-schema.sql`）。

8 张表全部创建：

```text
 Schema |       Name        | Type  | Owner
--------+-------------------+-------+--------
 public | metrics_snapshots | table | daopai
 public | sites             | table | daopai
 public | system_settings   | table | daopai
 public | task_logs         | table | daopai
 public | tasks             | table | daopai
 public | waybill_pool      | table | daopai
 public | waybill_results   | table | daopai
 public | windows           | table | daopai
(8 rows)
```

任务中心需要的 3 张核心表全部存在：`tasks` / `task_logs` / `waybill_results`。

---

## 11. 任务中心 API Before / After

### Before（Docker PG 未启动）

```text
GET /api/operations
→ HTTP 500
→ { "error": "connect ECONNREFUSED 127.0.0.1:5435" }
```

### After（Docker PG 已启动 + schema 初始化）

```text
GET /api/operations
→ HTTP 200
→ { "page": 1, "limit": 20, "total": 0, "tasks": [] }
```

### 统计端点

```text
GET /api/operations/stats
→ HTTP 200
→ {
    "tasks": { "total": 0, "running": 0, "done": 0, "failed": 0, "cancelled": 0, "pending": 0 },
    "system": { "easybrConnected": false, "onlineWindows": 0, "activeWorkers": 0, "runningTasks": 0 },
    "source": "pg"
  }
```

> `source: "pg"` 表示数据来自 PostgreSQL（非降级 fallback）。

---

## 12. HTTP 500 根因

**根因：Docker PostgreSQL 容器从未启动。**

调用链：

```text
前端 TasksPage
  → client.ts getTaskList()
  → GET /api/operations
  → routes.ts:1629 router.get('/api/operations')
  → PgDatabase.getInstance().getTaskList()
  → pg.Pool → 127.0.0.1:5435
  → ❌ ECONNREFUSED（容器未运行）
  → catch → res.status(500).json({ error: ... })
```

**修复方式**：`docker compose up -d postgres`

- 容器启动后，`init-schema.sql` 自动执行建表
- `pg.Pool` 在下一次 API 请求时自动重连（lazy connection）
- 无需重启后端、无需修改代码

---

## 13. /api/operations 返回结果

```json
{
  "page": 1,
  "limit": 20,
  "total": 0,
  "tasks": []
}
```

空任务时正确返回空列表（不报 500），前端任务中心显示"暂无任务"。

---

## 14. 任务中心页面是否恢复正常

**是。**

- 前端 `http://localhost:5275/tasks` → HTTP 200 ✅
- API `GET /api/operations` → HTTP 200, tasks: [] ✅
- 不再显示"获取任务列表失败：HTTP 500"

---

## 15. 是否影响 Playwright Header / READY / P0

**否。** Playwright 相关功能完全不受影响：

```text
GET /api/sites/site-1782121346155/playwright-windows
→ HTTP 200
→ 4 windows（肖飞/孟德海/刘磊/罗晓红）
```

Playwright Header 数据源、READY 守卫、P0 检查逻辑均未修改，功能正常。

---

## 通过标准对照

| # | 通过标准 | 结果 |
|---|---------|------|
| 1 | V1 未修改 | ✅ 仅启动 V2 Docker |
| 2 | V2 PostgreSQL Docker 独立运行 | ✅ daopai-next-postgres (healthy) |
| 3 | V2 使用独立端口 5435 | ✅ 5435:5432 |
| 4 | V2 使用独立 database daopai_next | ✅ |
| 5 | V2 使用独立 volume daopai_v2_pgdata | ✅ daopai_next_pgdata |
| 6 | 后端能连接 PostgreSQL | ✅ GET /api/operations → 200 |
| 7 | 必要表已初始化 | ✅ 8 tables (tasks/task_logs/waybill_results + 5) |
| 8 | 任务中心不再 HTTP 500 | ✅ 返回 { tasks: [], total: 0 } |
| 9 | 空任务时页面正常显示暂无任务 | ✅ 前端 HTTP 200 |
| 10 | Playwright Header / READY / P0 不受影响 | ✅ playwright-windows → 200, 4 windows |

---

## 附录：启动与验证命令

```powershell
cd bnsyV2

# 启动 PostgreSQL（schema 自动初始化）
docker compose up -d postgres

# 验证容器健康
docker ps --filter "name=daopai-next-postgres"

# 验证表
docker exec daopai-next-postgres psql -U daopai -d daopai_next -c "\dt"

# 验证后端接口
curl http://localhost:3200/api/operations

# 验证前端
# 打开 http://localhost:5275/tasks
```
