# Playwright 运行时设计（Playwright Runtime Design）

> 替代 EasyBR 指纹浏览器的下一代浏览器运行层设计文档。
>
> Phase 1-A/1-B/1-C 已完成 POC 验证，本文档为定稿版本。

## 一、设计目标

- 由 Playwright **原生启动**浏览器（`chromium.launchPersistentContext` + `channel: 'chrome'`），不依赖任何第三方指纹浏览器。
- 每个窗口对应一个**持久化浏览器上下文**（`BrowserContext`），保留 cookie / localStorage / 登录态。
- 支持多租户隔离：profile 按 `tenantId/siteId/windowId` 三层分目录。
- 支持并发：多窗口可同时运行不同任务。
- runtimeKey 统一为 `tenantId:siteId:windowId`，确保不同租户/站点下同名 windowId 不会误关。

## 二、目录结构

```
runtime/profiles/
└── <tenantId>/
    └── <siteId>/
        └── <windowId>/
            ├── Default/              # Chrome 持久化 context 数据
            │   ├── Network/Cookies   # Cookie 数据库
            │   ├── Local Storage/    # localStorage（含 JWT token）
            │   ├── Sessions/         # 会话数据
            │   └── ...
            └── Local State
```

**路径安全验证**：
- `sanitizeSegment` 清理非法字符（防止路径穿越）
- `validatePath` 禁止临时目录、禁止 `bnsy-operator/` 目录、必须在 `runtime/profiles/` 下

## 三、核心 API

```typescript
// backend/playwright-runtime/PlaywrightRuntime.ts

export class PlaywrightRuntime {
  // 启动窗口（返回含 runtimeKey 和 userDataDir）
  async launchWindow(opts: PlaywrightWindowOptions): Promise<PlaywrightLaunchResult>;

  // 关闭窗口（幂等，Phase 1-C）
  async closeWindow(runtimeKeyOrTenantId: string, siteId?: string, windowId?: string): Promise<CloseResult>;

  // 关闭所有窗口（POC 专用）
  async closeAll(): Promise<void>;

  // 实时刷新状态（Phase 1-C）
  async refreshState(runtimeKey: string): Promise<{ state?, notFound }>;

  // 会话调试（Phase 1-C）
  async getSessionDebug(runtimeKey: string): Promise<SessionDebugInfo | { error }>;

  // 手动触发登录
  async manualLogin(runtimeKey: string, credential: PlaywrightCredential): Promise<PlaywrightLoginResult>;

  // 状态查询
  getWindowStateJSON(runtimeKey: string);
  getWindowStateByTriple(tenantId, siteId, windowId);
  listWindowsJSON();
  getPage(runtimeKey: string);  // 供后续业务操作使用
}
```

## 四、与 legacy BrowserPool 的关系

- 当前 `backend/browser/BrowserPool.ts` 含 `connectOverCDP` 调用，标记为 `LEGACY`。
- Phase 1 新增 `PlaywrightRuntime`，**不修改** `BrowserPool` 的任何调用方。
- Phase 2 将设计兼容层，逐步迁移 `BrowserPool` 的调用方。
- Phase 3 迁移正式任务链路（AssignmentEngine / Handlers）。
- 迁移完成后 `BrowserPool` 将被替换或删除，`EasyBRClient` 一并移除。

**隔离合规要求**（Phase 1-C 已验证）：
- `playwright-runtime/` 目录无 `EasyBRClient` import
- `playwright-runtime/` 目录无 `connectOverCDP` 调用（仅注释中说明"不使用"）
- 无跨项目 import（不从 `../bnsy-operator/` 或 `../easybr/` 引入）

## 五、POC 阶段约束

- Phase 1 **仅 POC**，不替换 BrowserPool。
- 不修改 AssignmentEngine / Handlers / 正式任务接口。
- 不接入正式任务执行。
- POC 路由独立挂载在 `/api/playwright-poc`，不影响正式 `routes.ts`。

## 六、窗口生命周期策略（Phase 1-C 定稿）

### 6.1 核心原则

> **DaoPai Next 不依赖"关闭浏览器后恢复登录态"作为核心机制。**

Phase 1-C 实测发现：Playwright `launchPersistentContext` 模式下，session cookie（`Jwt-Token`）会被持久化到 userDataDir，closeWindow 后重启仍可保持登录态（见第七章 7.3）。

尽管如此，DaoPai Next 仍采用**窗口常开策略**作为核心机制，而非依赖持久化恢复。理由：
1. 窗口常开是更稳健的策略，不依赖持久化机制的边缘行为
2. 目标系统的会话策略可能变化，不应假设关闭后一定免登录
3. userDataDir 持久化作为**辅助**，减少意外关闭后的登录频率

### 6.2 窗口生命周期

1. **员工窗口启动并登录后，默认长期保持打开。**
2. **任务执行完成后，不关闭 context。**
3. **任务完成后状态从 `busy` 回到 `ready`。**
4. **只有以下情况才关闭 context：**
   - 用户主动关闭窗口
   - 系统退出（优雅停机）
   - 浏览器异常崩溃
   - 管理员手动操作
5. **userDataDir 仍保留**，用于缓存、减少登录频率、保留浏览器数据，但**不承诺关闭后一定免登录**。

### 6.3 状态流转

```
launching      启动中（context 创建 + 导航 + 状态检测）
   │
   ├─ 检测到登录页 → login_required
   │                    │
   │                    └─ 手动登录 / autoLogin 成功 → ready
   │
   └─ 检测到已登录 → ready
                        │
                        ├─ 任务开始 → busy
                        │              │
                        │              └─ 任务完成 → ready（不关闭 context）
                        │
                        └─ 用户关闭 / 系统退出 → closed
```

### 6.4 与 EasyBR legacy 的区别

| 维度 | EasyBR legacy | Playwright Runtime |
|------|---------------|-------------------|
| 启动方式 | `connectOverCDP` 连接指纹浏览器 | `launchPersistentContext` 原生启动 Chrome |
| 窗口生命周期 | 依赖 EasyBR 软件管理 | 由 DaoPai Next 后端管理 |
| 任务后处理 | 可能关闭窗口 | **不关闭 context**，状态回到 ready |
| 登录态恢复 | 依赖 EasyBR 窗口 | userDataDir 缓存 + 窗口常开 |
| 多租户隔离 | 无 | 三层 profile 隔离 |

## 七、会话保持分析（Phase 1-B/1-C 结论）

### 7.1 Phase 1-B 初步验证

- ✓ userDataDir 持久化机制正常（目录完整、文件有内容）
- ✓ Local Storage 中存有 JSON 对象（`netWork` key，网点信息，非 JWT）
- ✗ 初步测试中关闭窗口后重新启动跳转 `/login`（后续被 Phase 1-C 修正，见 7.3）

### 7.2 Phase 1-C 调试能力

新增 `GET /api/playwright-poc/window/session-debug` 接口，采集：
- JWT token 解析（header / payload / iat / exp / 是否过期 / 剩余秒数）
- Cookie 分析（session vs persistent / httpOnly / secure / sameSite）
- 登录状态（isLoginPage / isLoggedIn / currentUrl）

token 脱敏：前 12 位 + `...` + 后 6 位，不打印完整 token。

**Phase 1-C 改进**：`analyzeJwt` 同时查 Cookie 和 localStorage，优先 Cookie。
笨鸟速运系统的真正 JWT 在 Cookie `Jwt-Token` 中（非 localStorage）。

### 7.3 Phase 1-C 实测发现（修正 Phase 1-B 结论）

通过 session-debug 接口实测发现：

1. **JWT 实际位置**：Cookie `Jwt-Token`（session cookie，sameSite=Lax，非 httpOnly）
   - localStorage `netWork` key 存的是 JSON 对象 `{"id":26297,...}`，**不是 JWT**
   - Phase 1-B 误判 Local Storage 有 JWT，实际是网点信息 JSON

2. **JWT payload 字段**：
   - `alg`: `HS512`
   - `iat`: 登录时颁发的时间戳
   - `netWorkId`: 26297
   - `tenantId`: 809
   - `userId`: 53832
   - **没有 `exp` 字段**（token 本身不会因为时间过期）

3. **Cookie 清单**（目标 domain）：
   | 名称 | 类型 | 说明 |
   |------|------|------|
   | `Jwt-Token` | session cookie | 登录凭证（Playwright 持久化） |
   | `SECKEY_ABVK` | persistent | 百度地图安全 key（30 天） |
   | `BMAP_SECKEY` | persistent | 百度地图安全 key（30 天） |

4. **关键发现：closeWindow 后重启仍保持登录态**
   - Phase 1-C 场景 C 测试：显式 `closeWindow` 关闭 Chrome → 重新 `launch` 同一 userDataDir
   - 结果：`status=ready, isLoggedIn=true, currentUrl=/dashboard`
   - Jwt-Token cookie 仍存在，登录态保持
   - **Playwright `launchPersistentContext` 实际持久化了 session cookie 到 userDataDir**

### 7.4 Phase 1-B 结论修正

Phase 1-B 中"关闭后重启跳转 /login"的结论需要修正：
- 可能原因：Phase 1-B 测试时使用了不同的 close 方式（如进程杀死未优雅关闭 context）
- Phase 1-C 实测：通过 `closeWindow`（调用 `context.close()`）优雅关闭后，重启仍保持登录
- **当前结论**：在 Playwright `launchPersistentContext` 模式下，session cookie 被持久化，关闭后重启可保持登录态

### 7.5 应对策略

虽然 Phase 1-C 实测显示关闭后重启可保持登录态，但仍采用**窗口常开**策略（见第六章）：
1. 窗口常开是更稳健的策略，不依赖持久化机制的边缘行为
2. userDataDir 持久化作为**辅助**，减少意外关闭后的登录频率
3. 不承诺关闭后一定免登录（目标系统行为可能变化）

## 八、POC API 清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/playwright-poc/health` | 健康检查 |
| POST | `/api/playwright-poc/launch` | 启动窗口 |
| GET | `/api/playwright-poc/windows` | 列出所有窗口 |
| GET | `/api/playwright-poc/window` | 获取窗口状态（缓存） |
| GET | `/api/playwright-poc/window?refresh=true` | 实时刷新状态（Phase 1-C） |
| POST | `/api/playwright-poc/window/close` | 关闭窗口（幂等，Phase 1-C） |
| POST | `/api/playwright-poc/close-all` | 关闭所有窗口 |
| POST | `/api/playwright-poc/window/login` | 手动触发登录 |
| GET | `/api/playwright-poc/window/login-probe` | 探测登录表单 |
| GET | `/api/playwright-poc/window/session-debug` | 会话调试（Phase 1-C） |
| POST | `/api/playwright-poc/window/navigate` | 导航到指定 URL（Phase 1-C，POC 专用） |

## 九、Phase 1-B/1-C 验证总结

### 9.1 通过项

1. ✓ Playwright 能稳定打开 Chrome（`channel: 'chrome'`）
2. ✓ 能进入目标系统（`bnsy.benniaosuyun.com`）
3. ✓ 能手动登录
4. ✓ runtimeKey 三层隔离有效
5. ✓ userDataDir 三层隔离有效
6. ✓ close / close-all 可用（幂等）
7. ✓ 多 runtime 不串 profile
8. ✓ 全程不依赖 EasyBR
9. ✓ 不影响 bnsy-operator 生产项目
10. ✓ 状态识别准确（修复 networkidle 等待后）
11. ✓ refresh=true 可实时更新状态（Phase 1-C）
12. ✓ closeWindow 幂等（Phase 1-C）
13. ✓ JWT 分析可从 Cookie `Jwt-Token` 解析（Phase 1-C）
14. ✓ 场景 A：窗口常开 5 分钟登录态保持（Phase 1-C）
15. ✓ 场景 B：任务导航后状态保持 ready（Phase 1-C）
16. ✓ 场景 C：closeWindow 后重启仍保持登录态（Phase 1-C，修正 Phase 1-B 结论）

### 9.2 已知限制

1. GET /window 默认返回缓存状态 → 提供 refresh=true 实时检测
2. closeWindow 后重启虽保持登录态，但不承诺作为核心机制（目标系统行为可能变化）
