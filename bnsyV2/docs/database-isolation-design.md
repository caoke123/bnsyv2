# 数据库隔离设计（Database Isolation Design）

> `bnsy-operator-next` 与原生产项目数据库的隔离说明。

## 一、连接参数隔离

| 参数 | 生产项目 | 新项目 |
| --- | --- | --- |
| 主机 | 127.0.0.1 | 127.0.0.1 |
| 端口 | 5434 | **5435** |
| 数据库名 | bnsy_operator | **daopai_next** |
| 用户 | bnsy | **daopai** |
| 密码 | bnsy_secret | **daopai_secret** |
| Docker 容器 | bnsy-postgres | **daopai-next-postgres** |
| Docker volume | （bind mount） | **daopai_next_pgdata** |

## 二、配置位置

- 环境变量：[`.env`](../.env) 和 [`.env.example`](../.env.example)
- 加载逻辑：[`backend/db/PgDatabase.ts`](../backend/db/PgDatabase.ts) `loadConfig()`
- Docker 编排：[`docker-compose.yml`](../docker-compose.yml)

## 三、开发模式降级

- 开发环境下（`NODE_ENV !== 'production'`），后端使用 JSON 文件存储（`data/db.json`），不依赖 PostgreSQL。
- 生产环境（Docker）启动时自动连接 PostgreSQL，schema 文件位于 [`database/schema/init-schema.sql`](../database/schema/init-schema.sql)。

## 四、Schema 隔离

- 新项目 schema 文件独立：`database/schema/init-schema.sql`。
- 与原项目 schema 完全解耦，可独立演进。
- 后续 Phase 2 / Phase 3 将在此基础上追加租户相关表和字段。

## 五、迁移脚本

- `database/migrations/` 预留给后续 schema 迁移。
- `database/seed/` 预留给种子数据。
- 当前阶段不执行任何迁移。

## 六、验证

```bash
# 确认未连接生产数据库
grep -rE "bnsy_operator|5434" backend/ --include="*.ts"   # 应无结果（注释除外）

# 确认使用新数据库
grep -rE "daopai_next|5435" backend/ --include="*.ts"     # 应有结果
```
