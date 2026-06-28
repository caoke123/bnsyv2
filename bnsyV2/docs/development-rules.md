# 开发规则（Development Rules）

> 本文件是 `bnsy-operator-next` 项目的强制开发约束。所有贡献者在动手前必须阅读并遵守。

## 一、项目身份

1. **本项目是 `bnsy-operator-next`，不是 `bnsy-operator`。**
2. **本项目不使用 EasyBR。**
3. **本项目不读取、不引用、不修改 `bnsy-operator/`。**
4. **本项目不复用原项目数据库、端口、runtime、settings.json、GitHub 仓库。**
5. **本项目浏览器运行层目标是 Playwright 自管窗口。**
6. **原项目 EasyBR 文档均为历史资料，不作为本项目开发依据。**

## 二、代码引用约束

- 禁止 `import ../bnsy-operator/` 的任何文件。
- 禁止读取 `bnsy-operator/data/settings.json`。
- 禁止连接 `bnsy_operator` 数据库。
- 禁止使用生产端口 `3100 / 5175 / 5434`。
- 禁止操作原项目 EasyBR 窗口（启动 / 关闭 / 切换）。

## 三、Legacy 代码处理

- `backend/easybr/EasyBRClient.ts` 和 `backend/browser/BrowserPool.ts` 中含原 EasyBR / CDP 集成代码，标记为 `LEGACY`。
- 本阶段**保留不删**，后续阶段用 Playwright 原生实现替换。
- 新增代码**不得调用** legacy EasyBR API；如需浏览器能力，等 Playwright 原生层就绪后再接入。

## 四、文档约束

- `archive-legacy-docs/` 内为原项目历史资料，**仅作存档**，不得作为开发依据。
- 新项目指导文档统一放在 `docs/`，当前包括：
  - `upgrade-plan.md` — 升级路线图
  - `project-boundary.md` — 项目边界
  - `playwright-runtime-design.md` — Playwright 运行时设计
  - `tenant-isolation-design.md` — 租户隔离设计
  - `database-isolation-design.md` — 数据库隔离设计
  - `development-rules.md` — 本文件

## 五、Git 约束

- 本项目独立 Git 仓库，**不复用原项目 remote**。
- 在用户提供新 GitHub 仓库地址前，**不得添加 remote**。
- 严禁推送到 `caoke123/bnsy` 或任何原项目关联仓库。

## 六、本阶段不做的事

- 不重构 AssignmentEngine。
- 不改造到件 / 派件 / 签收 / 到派一体业务逻辑。
- 不开发会员系统。
- 不替换 BrowserPool（仅标记 legacy）。
- 不启动或关闭 EasyBR。
- 不操作原生产项目。
