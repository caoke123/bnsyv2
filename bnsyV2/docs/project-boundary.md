# 项目边界（Project Boundary）

> 明确 `bnsy-operator-next` 与原生产项目 `bnsy-operator` 的边界，杜绝交叉污染。

## 一、项目定位

| 项目 | 定位 | 状态 |
| --- | --- | --- |
| `bnsy-operator/` | 现生产项目，EasyBR 版 | **冻结保护**，严禁修改 |
| `bnsy-operator-next/` | 下一代升级项目 | 初始化中，Playwright 原生 + 会员隔离 |

## 二、资源隔离矩阵

| 资源 | 生产项目 | 新项目 |
| --- | --- | --- |
| 前端端口 | 5173 | **5275** |
| 后端端口 | 3100 | **3200** |
| PostgreSQL 端口 | 5434 | **5435** |
| Redis 端口 | 6379 | **6380** |
| 数据库名 | bnsy_operator | **daopai_next** |
| DB 用户 | bnsy | **daopai** |
| Docker 容器名 | bnsy-* | **daopai-next-*** |
| Docker volume | （bind mount） | **daopai_next_*** |
| runtime 根目录 | logs/ + screenshots/ | **runtime/**（profiles/screenshots/logs/downloads） |
| settings.json | bnsy-operator/data/settings.json | **bnsy-operator-next/data/settings.json** |
| 浏览器管理 | EasyBR 指纹浏览器 | **Playwright 原生**（legacy EasyBR 待替换） |
| GitHub 仓库 | 原仓库（已解绑） | **待用户创建新仓库** |

## 三、禁止交叉项

- 新项目代码**不得** import `../bnsy-operator/` 任何文件。
- 新项目**不得**读取原项目 `data/settings.json`。
- 新项目**不得**连接原项目数据库 `bnsy_operator`。
- 新项目**不得**复用原项目 Docker 容器 / volume / network。
- 新项目**不得**启动 / 关闭 / 操作原项目 EasyBR 窗口。
- 新项目**不得**推送或绑定原项目 GitHub remote。

## 四、允许交叉项（只读参考）

- 允许**读取** `bnsy-operator/` 代码作为参考。
- 允许把 `bnsy-operator/` 中必要代码**复制**到 `bnsy-operator-next/`，复制后必须成为新项目自己的文件。

## 五、验证命令

```bash
# 确认无跨项目引用
grep -r "\.\.[/\\\\]bnsy-operator" backend/ frontend/ scripts/   # 应无结果

# 确认无生产端口
grep -rE "3100|5175" backend/ frontend/ --include="*.ts"          # 应无结果（注释除外）

# 确认无原 GitHub remote
git remote -v                                                     # 应为空
```
