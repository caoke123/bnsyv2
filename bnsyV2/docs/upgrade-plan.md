# 升级路线图（Upgrade Plan）

> `bnsy-operator-next` 从 EasyBR 时代向 Playwright 原生 + 会员隔离演进的路线图。

## 一、总体目标

1. 浏览器运行层从 EasyBR 指纹浏览器迁移到 **Playwright 原生自管窗口**。
2. 引入**会员系统**，支持多会员独立运营。
3. 实现会员之间**窗口、员工、任务、日志完全隔离**。
4. 保留并复用现项目 UI、操作流程、任务执行逻辑。

## 二、阶段划分

### Phase 0 — 初始化与隔离 ✅ 已完成

- 复制 `bnsy-operator/` 前后端代码作为基础。
- 完成端口、数据库、Docker、runtime、settings.json 全面隔离。
- 保留 EasyBR 相关代码并标记为 `LEGACY`。
- 清理旧 EasyBR 时代文档，移至 `archive-legacy-docs/`。
- 清理原项目 Git 信息，等待用户创建新仓库。

### Phase 1 — Playwright 原生运行时 ⏳ 待启动

- 设计 `PlaywrightRuntime`：自管 `chromium.launch()` + 持久化 context。
- 浏览器 profile 存放于 `runtime/profiles/<tenantId>/<windowId>/`。
- 替换 `BrowserPool` 中 `connectOverCDP` 调用为 Playwright 原生启动。
- 移除对 `EasyBRClient` 的依赖（保留 legacy 文件待最终删除）。
- 验收：能在无 EasyBR 环境下完成一次签收 / 派件流程。

### Phase 2 — 会员系统接入 ⏳ 待启动

- 数据库新增 `tenants` / `users` / `tenant_members` 表。
- 后端引入租户上下文中间件（`TenantContext`）。
- 前端增加登录页 + 会员切换 UI。
- 验收：多会员可独立登录并切换。

### Phase 3 — 资源隔离落地 ⏳ 待启动

- 窗口、员工、任务、日志表全部新增 `tenant_id` 字段。
- 所有查询追加 `WHERE tenant_id = ?` 约束。
- Playwright profile 按 `tenantId` 分目录隔离。
- 验收：A 会员无法看到 B 会员的任何数据。

### Phase 4 — 业务对齐与上线 ⏳ 待启动

- 对齐 AssignmentEngine 与新运行时。
- 完整回归到件 / 派件 / 签收 / 到派一体。
- 性能与稳定性压测。
- 上线切换（可与原项目并行运行一段时间）。

## 三、本阶段边界（Phase 0 收尾）

- 不重构业务逻辑。
- 不替换 BrowserPool。
- 不开发会员系统。
- 不启动或关闭 EasyBR。
- 不操作原生产项目。
