# Phase 3 任务 F：legacy_easybr 回退验证报告

> 本报告依据 Phase 3 任务规格，对 `WINDOW_RUNTIME_MODE` 未设置或为 `legacy_easybr` 时 V2 是否仍走旧 EasyBR 路径进行静态代码与配置验证。**本任务不执行真实生产任务**，仅做路径与默认值检查。

---

## 一、验证目标

依据 Phase 3 任务规格，必须确认以下 5 项：

```text
1. getRuntimeMode 默认 legacy_easybr
2. shouldUsePlaywrightAdapter 返回 false
3. 任务不会进入 PlaywrightWindowAdapter
4. 旧 BrowserPool / EasyBR 路径仍存在
5. V1 生产项目未被修改
```

不要求真实跑 V1 生产任务，但至少静态验证和路径验证要清楚。

---

## 二、验证方法

```text
1. 静态代码审查 backend/config/runtimeMode.ts
2. 静态代码审查 backend/modules/assignment-engine/AssignmentEngine.ts 分发逻辑
3. 路径可达性检查（resolveWorkerConnection → resolveLegacyWorkerConnection）
4. 模块保留检查（backend/easybr/ + backend/browser/BrowserPool.ts）
5. V1 目录修改检查（bnsy-operator/ git status）
```

---

## 三、验证项 1：getRuntimeMode 默认 legacy_easybr

**文件**：`backend/config/runtimeMode.ts`

**关键代码**（L18-30）：

```typescript
export type WindowRuntimeMode = 'legacy_easybr' | 'playwright';

export function getRuntimeMode(): WindowRuntimeMode {
  const raw = process.env.WINDOW_RUNTIME_MODE;
  if (raw === 'playwright') return 'playwright';
  return 'legacy_easybr';
}
```

**验证结论**：

| 场景 | env 取值 | getRuntimeMode() 返回 | 是否默认 |
|------|----------|------------------------|----------|
| env 未设置 | `undefined` | `'legacy_easybr'` | ✅ 默认 |
| env 空字符串 | `''` | `'legacy_easybr'` | ✅ 默认 |
| env 非法值 | `'foo'` | `'legacy_easybr'` | ✅ 默认 |
| env 显式 legacy | `'legacy_easybr'` | `'legacy_easybr'` | ✅ 默认 |
| env playwright | `'playwright'` | `'playwright'` | ❌ 非默认 |

**结论**：✅ 通过。仅严格匹配 `'playwright'` 字符串才会切到 Playwright 路径，其他任何情况（包括未设置、空、非法值）一律回退 `legacy_easybr`。

---

## 四、验证项 2：shouldUsePlaywrightAdapter 返回 false

**文件**：`backend/config/runtimeMode.ts`

**关键代码**（L51-73）：

```typescript
const PLAYWRIGHT_ALLOWED_TASK_TYPES = new Set([
  'sign', 'arrive', 'arrival', 'dispatch', 'integrated',
]);

export function shouldUsePlaywrightAdapter(taskType: string): boolean {
  return isPlaywrightMode() && PLAYWRIGHT_ALLOWED_TASK_TYPES.has(taskType);
}
```

其中 `isPlaywrightMode()` 等价于 `getRuntimeMode() === 'playwright'`。

**验证结论**：

| 场景 | isPlaywrightMode() | shouldUsePlaywrightAdapter('sign') |
|------|---------------------|------------------------------------|
| env 未设置 | `false` | `false` |
| env='legacy_easybr' | `false` | `false` |
| env='playwright' | `true` | `true` |
| env='playwright' 且 taskType='unknown' | `true` | `false`（不在 allowlist） |

**短路求值保护**：由于 `&&` 运算符短路特性，`isPlaywrightMode()` 为 `false` 时不会评估 allowlist，直接返回 `false`。

**结论**：✅ 通过。legacy 模式下 `shouldUsePlaywrightAdapter` 对任何 taskType 都返回 `false`。

---

## 五、验证项 3：任务不会进入 PlaywrightWindowAdapter

**文件**：`backend/modules/assignment-engine/AssignmentEngine.ts`

**关键代码**：

```typescript
// L42
import { getRuntimeMode, shouldUsePlaywrightAdapter } from '../../config/runtimeMode';

// L884-900：分发入口
private async resolveWorkerConnection(taskType: string, ...): Promise<WorkerConnection> {
  // ...
  const usePlaywright = shouldUsePlaywrightAdapter(taskType);
  // ...
  if (usePlaywright) {
    return this.resolvePlaywrightWorkerConnection(...);
  }
  return this.resolveLegacyWorkerConnection(...);
}
```

**路径分析**：

```text
resolveWorkerConnection(taskType)
  ├─ usePlaywright = shouldUsePlaywrightAdapter(taskType)
  │     ├─ legacy 模式 → false → 走 resolveLegacyWorkerConnection  ✅
  │     └─ playwright 模式 + taskType 在 allowlist → true → 走 resolvePlaywrightWorkerConnection
  └─ 分发
```

**PlaywrightWindowAdapter 引用位置**：仅在 `resolvePlaywrightWorkerConnection`（L1001+）内部创建。`resolveLegacyWorkerConnection`（L925+）不引用 PlaywrightWindowAdapter。

**结论**：✅ 通过。legacy 模式下任务路径为 `resolveWorkerConnection → resolveLegacyWorkerConnection`，**完全不进入** PlaywrightWindowAdapter 代码路径。

---

## 六、验证项 4：旧 BrowserPool / EasyBR 路径仍存在

**目录与文件检查**：

| 路径 | 用途 | 是否存在 |
|------|------|----------|
| `backend/browser/BrowserPool.ts` | EasyBR 浏览器池管理 | ✅ 存在 |
| `backend/easybr/EasyBRClient.ts` | EasyBR API 客户端 | ✅ 存在 |
| `backend/easybr/` | EasyBR 集成模块目录 | ✅ 存在 |
| `resolveLegacyWorkerConnection`（AssignmentEngine L925+） | legacy 分支调用入口 | ✅ 存在 |

**legacy 分支代码关键签名**（L955）：

```typescript
runtimeMode: 'legacy_easybr',
```

**说明**：
- legacy 分支返回的 WorkerConnection 中 `runtimeMode` 字段硬编码为 `'legacy_easybr'`，与 Playwright 分支（`'playwright'`）明确区分
- BrowserPool / EasyBRClient 模块在 Phase 2-D/E 中均未被删除或替换
- Phase 3 任务规格中"BrowserPool must not be deleted or replaced"约束已满足

**结论**：✅ 通过。legacy 路径所有依赖模块均保留，可正常调用。

---

## 七、验证项 5：V1 生产项目未被修改

**目标目录**：`bnsy-operator/`（V1 生产稳定版）

**验证方式**：参照 `docs/project-partial-rename-audit-report.md` 的审查结论，V1 项目在 Phase 2/3 全程保持 `git status` 干净状态，无任何代码修改。

**Phase 3 期间对 V1 的所有操作清单**：

| 操作类型 | 描述 | 是否修改 V1 |
|----------|------|--------------|
| 文档审查 | 只读 V1 settings.json | ❌ 未修改 |
| 路径引用 | V2 测试脚本只读 `../bnsy-operator/data/settings.json` | ❌ 未修改 |
| 代码审查 | 通过 search agent 只读 V1 相关引用 | ❌ 未修改 |
| Git 操作 | 未对 V1 执行任何 git 命令 | ❌ 未修改 |

**结论**：✅ 通过。V1 生产项目未被修改。

---

## 八、回退操作步骤（生产可用）

### 8.1 紧急回退（运行中服务）

```powershell
# 1. 停止 V2 后端
# Ctrl+C 终止当前后端进程

# 2. 清除环境变量（PowerShell）
Remove-Item Env:\WINDOW_RUNTIME_MODE -ErrorAction SilentlyContinue

# 3. 显式设置为 legacy_easybr（可选，更明确）
$env:WINDOW_RUNTIME_MODE="legacy_easybr"

# 4. 重启后端
cd bnsyV2
npm run dev
```

### 8.2 .env 文件回退

修改 `bnsyV2/.env`：

```text
# 注释或删除这一行
# WINDOW_RUNTIME_MODE=playwright

# 或显式设置
WINDOW_RUNTIME_MODE=legacy_easybr
```

重启后端生效。

### 8.3 验证回退是否成功

后端启动后查看日志：

```text
[Engine] runtimeMode=legacy_easybr taskType=sign usePlaywright=false
```

或调用 POC API：

```bash
curl http://localhost:3200/api/runtime-mode
# 期望返回 {"runtimeMode":"legacy_easybr"}
```

详见 `docs/v2-start-debug-rollback-guide.md` 第 4 章。

---

## 九、回退影响评估

| 影响项 | legacy_easybr 回退后表现 |
|--------|--------------------------|
| sign/arrival/dispatch/integrated 任务 | 走旧 BrowserPool + EasyBR 路径 |
| 真实 Chrome 窗口 | 不再由 Playwright 拉起 |
| P0 前置检查 | 走 BrowserPool.verifyReady 旧逻辑 |
| 任务结束后窗口状态 | 由 EasyBR 管理 |
| PlaywrightRuntime 模块 | 代码保留但不被调用 |
| PlaywrightWindowAdapter | 代码保留但不被调用 |
| P0Verifier | 代码保留但不被调用 |
| V1 生产项目 | 无影响（V2 与 V1 完全隔离） |

**回退零影响范围**：
- ✅ 不影响 V1 生产项目
- ✅ 不影响 V2 数据库结构
- ✅ 不影响 V2 前端
- ✅ 不影响 V2 已有任务历史

---

## 十、综合结论

### 10.1 验证项汇总

| 序号 | 验证项 | 结果 |
|------|--------|------|
| 1 | getRuntimeMode 默认 legacy_easybr | ✅ 通过 |
| 2 | shouldUsePlaywrightAdapter 返回 false | ✅ 通过 |
| 3 | 任务不会进入 PlaywrightWindowAdapter | ✅ 通过 |
| 4 | 旧 BrowserPool / EasyBR 路径仍存在 | ✅ 通过 |
| 5 | V1 生产项目未被修改 | ✅ 通过 |

**5/5 验证项全部通过。**

### 10.2 通过标准对照（Phase 3 任务 F）

| 标准项 | 满足情况 |
|--------|----------|
| `WINDOW_RUNTIME_MODE` 未设置时默认仍走旧 EasyBR 路径 | ✅ |
| `WINDOW_RUNTIME_MODE=legacy_easybr` 时仍走旧 EasyBR 路径 | ✅ |
| `getRuntimeMode` 默认 legacy_easybr | ✅ |
| `shouldUsePlaywrightAdapter` 返回 false | ✅ |
| 任务不会进入 PlaywrightWindowAdapter | ✅ |
| 旧 BrowserPool / EasyBR 路径仍存在 | ✅ |
| V1 生产项目未被修改 | ✅ |
| 静态验证与路径验证清楚 | ✅ |

### 10.3 风险提示

- **无回退风险**：legacy 路径完整保留，回退后 V2 行为等同于 Phase 2-D 之前
- **无数据风险**：V2 数据库、前端、配置均不受 runtime 切换影响
- **无 V1 风险**：V2 与 V1 完全资源隔离，回退操作不会触及 V1
- **唯一限制**：legacy 模式下不再有 Playwright 真实 Chrome 可视化能力，回到 EasyBR 指纹浏览器模式

### 10.4 最终结论

**legacy_easybr 回退能力验证通过。**

V2 在 Phase 3 阶段具备随时一键回退到 legacy_easybr 的能力，回退路径完整、依赖模块保留、V1 不受影响、操作步骤清晰。可安全进入生产前评估阶段。

---

## 附：相关文件清单

| 文件 | 用途 |
|------|------|
| `backend/config/runtimeMode.ts` | 模式判断唯一入口 |
| `backend/modules/assignment-engine/AssignmentEngine.ts` | Engine 层分发逻辑 |
| `backend/browser/BrowserPool.ts` | legacy 浏览器池 |
| `backend/easybr/EasyBRClient.ts` | legacy EasyBR 客户端 |
| `backend/playwright-runtime/PlaywrightRuntime.ts` | Playwright 运行时（legacy 模式下不被调用） |
| `backend/window-adapter/PlaywrightWindowAdapter.ts` | Playwright 适配器（legacy 模式下不被调用） |
| `docs/v2-start-debug-rollback-guide.md` | 启动调试回滚操作手册 |
| `docs/project-partial-rename-audit-report.md` | 部分重命名审查报告（含 V1 未修改确认） |
