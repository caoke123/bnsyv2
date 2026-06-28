/**
 * Window Runtime Routes — Phase 4-B
 *
 * 为前端 Header 提供 runtimeMode 感知 + Playwright 窗口状态查询/启动接口。
 *
 * 设计原则：
 *   1. 独立于 routes.ts 业务接口（不修改 routes.ts）
 *   2. 只读复用 SettingsManager / WindowAdapterRegistry / PlaywrightRuntime，不修改核心
 *   3. 不 import EasyBRClient（playwright 模式下 EasyBR 与本路由无关）
 *   4. 返回结构对齐 /api/sites/:siteId/windows，便于前端 WindowStateProvider 复用类型
 *   5. legacy_easybr 模式下前端走原 routes.ts 接口，本路由仅用于 playwright 模式
 *
 * 路由前缀: /api
 *
 * runtimeKey 约定（与 AssignmentEngine.resolvePlaywrightWorkerConnection 保持一致）：
 *   tenantId = 'tenant-default'
 *   siteId   = 内部 Site code（'tiannanda' | 'heyuan'）— 由 settings.json site.name 映射
 *   windowId = `staff-${staffName}`
 *   runtimeKey = `${tenantId}:${siteId}:${windowId}`
 */
import { Router, type Request, type Response } from 'express';
import { getRuntimeMode, type WindowRuntimeMode } from '../config/runtimeMode';
import { SettingsManager } from '../config/SettingsManager';
import { isLoginCapableWindow } from '../config/SettingsManager';
import { WindowAdapterRegistry } from '../window-adapter/WindowAdapterRegistry';
import { PlaywrightRuntime } from '../playwright-runtime/PlaywrightRuntime';
import { DEFAULT_TENANT_ID, buildRuntimeKey } from '../playwright-runtime/types';
import type { Site } from '../db/Database';
import type { AdapterWindowStatus } from '../window-adapter/types';

export const windowRuntimeRouter = Router();

const runtime = PlaywrightRuntime.getInstance();
const adapter = WindowAdapterRegistry.getInstance().getAdapter();

// ── 前端 WindowState 类型对齐（与 frontend/src/api/client.ts 一致） ──
// 本地定义，避免修改 backend/types/api-contracts.ts
type WindowState = 'offline' | 'connecting' | 'login_required' | 'connected' | 'ready' | 'busy' | 'degraded';

/**
 * 将 AdapterWindowStatus 映射为前端 WindowState
 *
 * 映射规则（Phase 4-B）：
 *   closed        → offline      （离线）
 *   opening       → connecting    （启动中）
 *   login_required→ login_required（待登录）
 *   ready         → ready         （就绪）
 *   busy          → busy          （执行中）
 *   failed        → degraded     （异常/不稳定）
 */
function mapAdapterToFrontend(s: AdapterWindowStatus): WindowState {
  switch (s) {
    case 'ready': return 'ready';
    case 'busy': return 'busy';
    case 'login_required': return 'login_required';
    case 'opening': return 'connecting';
    case 'closed': return 'offline';
    case 'failed': return 'degraded';
    default: return 'offline';
  }
}

/**
 * 将 settings.json 的 site.name 映射为内部 Site code
 *
 * 与 routes.ts normalizeSiteToCode 逻辑一致（复制以避免修改 routes.ts）。
 * 用于生成与 AssignmentEngine 一致的 runtimeKey。
 */
function normalizeSiteNameToCode(siteName: string): Site {
  if (siteName.includes('天南大')) return 'tiannanda';
  if (siteName.includes('和苑')) return 'heyuan';
  // 未知站点：回退使用 siteName 本身作为 siteId（与 engine 抛错不同，
  // 这里宽松处理以支持测试站点；运行时找不到窗口状态会显示 offline）
  return siteName as Site;
}

/**
 * 从 SettingsManager 解析明文凭据
 *
 * SettingsManager.loadConfig 已对 password 做 base64 解码，这里直接取明文。
 * 与 PlaywrightRuntime.lookupCredentialFromSettings 逻辑一致（复制以避免修改核心）。
 *
 * 注意：本函数不读取 BNSY_TEST_USERNAME/BNSY_TEST_PASSWORD 环境变量。
 * 凭据来源仅限 settings.json，符合"测试账号通过 settings.json 管理"的约定。
 */
async function resolveCredentialFromSettings(
  staffName: string,
  siteName?: string,
): Promise<{ account: string; password: string } | null> {
  const sm = SettingsManager.getInstance();
  const config = await sm.getConfig();
  if (!config?.sites) return null;

  for (const site of config.sites) {
    if (siteName && site.name !== siteName && site.id !== siteName) continue;
    for (const w of site.windows) {
      if (w.employeeName === staffName || w.windowName === staffName) {
        if (w.username && w.password) {
          return { account: w.username, password: w.password };
        }
      }
    }
  }
  return null;
}

/**
 * 在 adapter.ensureWindowReady 之后触发自动登录
 *
 * Phase 4-B：adapter 层强制 autoLogin=false（不修改 adapter 核心），
 * 因此 ensure 返回 login_required 时由本路由层调用 runtime.manualLogin
 * 完成登录。登录成功后状态由 login_required → ready。
 *
 * 凭据仅从 settings.json 获取（与 PlaywrightRuntime.resolveCredential 一致）。
 *
 * @returns 更新后的状态字符串（'ready' | 'login_required' | 原 status）
 */
async function tryAutoLoginAfterEnsure(
  ensureResult: { runtimeKey: string; status: string; launched: boolean },
  staffName: string,
  siteName: string,
): Promise<{ status: string; loginMessage?: string }> {
  if (ensureResult.status !== 'login_required') {
    return { status: ensureResult.status };
  }

  const cred = await resolveCredentialFromSettings(staffName, siteName);
  if (!cred) {
    return { status: 'login_required', loginMessage: '未找到凭据' };
  }

  try {
    const loginResult = await runtime.manualLogin(ensureResult.runtimeKey, cred);
    if (loginResult.success) {
      console.log(`[autoLogin] ${staffName} 登录成功，状态 ready`);
      return { status: 'ready' };
    }
    console.warn(`[autoLogin] ${staffName} 登录失败: ${loginResult.message}`);
    return { status: 'login_required', loginMessage: loginResult.message };
  } catch (e) {
    console.error(`[autoLogin] ${staffName} 登录异常: ${(e as Error).message}`);
    return { status: 'login_required', loginMessage: (e as Error).message };
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/runtime-mode — 只读返回当前窗口运行模式
// ═══════════════════════════════════════════════════════════
windowRuntimeRouter.get('/api/runtime-mode', (_req: Request, res: Response) => {
  const runtimeMode: WindowRuntimeMode = getRuntimeMode();
  console.log(`[runtime-mode] mode=${runtimeMode}`);
  res.json({ runtimeMode });
});

// ═══════════════════════════════════════════════════════════
// GET /api/sites/:siteId/playwright-windows — 返回该网点 Playwright 窗口状态
// ═══════════════════════════════════════════════════════════
// 返回结构与 /api/sites/:siteId/windows 对齐（不含 easybrHealth）
// 仅查询 PlaywrightWindowStateStore 缓存，不触发窗口启动
windowRuntimeRouter.get('/api/sites/:siteId/playwright-windows', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const sm = SettingsManager.getInstance();

    // getConfig() 在未初始化时抛 NOT_INITIALIZED，这里优雅降级为空列表
    let config;
    try {
      config = await sm.getConfig();
    } catch {
      return res.json({ siteId, siteName: '', windows: [], runtimeMode: 'playwright' as const });
    }

    if (!config.initialized) {
      return res.json({ siteId, siteName: '', windows: [], runtimeMode: 'playwright' as const });
    }

    const site = config.sites.find(s => s.id === siteId);
    if (!site) {
      return res.status(404).json({ error: `网点 ${siteId} 未配置` });
    }

    const siteCode = normalizeSiteNameToCode(site.name);
    // ★ Phase 4-C: 只返回可登录员工（有密码），无密码员工不参与窗口状态管理
    const loginCapableWindows = site.windows.filter(isLoginCapableWindow);
    console.log(`[playwright-windows] siteId=${siteId} siteName=${site.name} siteCode=${siteCode} totalWindows=${site.windows.length} loginCapable=${loginCapableWindows.length}`);

    const windows = loginCapableWindows.map(w => {
      const staffName = w.employeeName || w.windowName;
      const windowId = `staff-${staffName}`;
      const runtimeKey = buildRuntimeKey(DEFAULT_TENANT_ID, siteCode, windowId);

      // 只读取缓存状态，不触发 refreshState（避免每次轮询都打开页面检测）
      const cached = runtime.getWindowStateJSON(runtimeKey);

      let status: WindowState;
      if (!cached) {
        // 窗口未启动 → offline
        status = 'offline';
      } else {
        // 映射 PlaywrightWindowStatus → AdapterWindowStatus → WindowState
        // 复用 adapter 的 mapStatus 收敛逻辑（通过 refreshStatus 不可取，会触发页面检测）
        // 这里直接按 PlaywrightWindowStatus 映射
        const pwStatus = cached.status;
        let adapterStatus: AdapterWindowStatus;
        switch (pwStatus) {
          case 'launching':
          case 'logging_in':
            adapterStatus = 'opening';
            break;
          case 'ready':
            adapterStatus = 'ready';
            break;
          case 'busy':
            adapterStatus = 'busy';
            break;
          case 'login_required':
            adapterStatus = 'login_required';
            break;
          case 'closed':
            adapterStatus = 'closed';
            break;
          case 'error':
            adapterStatus = 'failed';
            break;
          default:
            adapterStatus = 'failed';
        }
        status = mapAdapterToFrontend(adapterStatus);
      }

      console.log(
        `[playwright-windows] ${staffName} | runtimeKey=${runtimeKey} | ` +
        `pwStatus=${cached?.status ?? '(未启动)'} → frontend=${status}`,
      );

      return {
        windowName: w.windowName,
        employeeName: w.employeeName,
        // browserId 在 playwright 模式下无意义，置 null（前端据此跳过 EasyBR open-browser）
        browserId: null,
        status,
        // 标记为 playwright 模式窗口，前端可据此区分点击行为
        runtimeMode: 'playwright' as const,
        runtimeKey,
        // ★ Phase 4-B READY 守卫诊断字段（前端据此收紧 READY 判断）
        currentUrl: cached?.currentUrl ?? '',
        pageCount: cached?.pageCount ?? 0,
        activePageUrl: cached?.activePageUrl ?? cached?.currentUrl ?? '',
        p0Passed: cached?.p0Passed ?? false,
        p0FailedCheck: cached?.p0FailedCheck ?? null,
        p0FailedReason: cached?.p0FailedReason ?? null,
      };
    });

    res.json({
      siteId,
      siteName: site.name,
      windows,
      // playwright 模式下不返回 easybrHealth（EasyBR 不是当前 runtime）
      runtimeMode: 'playwright' as const,
    });
  } catch (e) {
    console.error(`[GET /api/sites/${req.params.siteId}/playwright-windows] 失败:`, (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/sites/:siteId/playwright-windows/launch-all — 启动该网点所有 offline 窗口
// ═══════════════════════════════════════════════════════════
// 调用 adapter.ensureWindowReady 启动所有未就绪窗口
// 不依赖 EasyBR，headed=true / keepOpen=true 由 adapter 生命周期保证
windowRuntimeRouter.post('/api/sites/:siteId/playwright-windows/launch-all', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const sm = SettingsManager.getInstance();
    const config = await sm.getConfig();

    if (!config.initialized) {
      return res.status(400).json({ error: '系统尚未完成 PIN 初始化' });
    }

    const site = config.sites.find(s => s.id === siteId);
    if (!site) {
      return res.status(404).json({ error: `网点 ${siteId} 未配置` });
    }

    const siteCode = normalizeSiteNameToCode(site.name);
    // ★ Phase 4-C: 只启动可登录员工（有密码），无密码员工不能作为执行窗口
    const loginCapableWindows = site.windows.filter(isLoginCapableWindow);
    const totalWindows = site.windows.length;
    const skippedNoPassword = site.windows.length - loginCapableWindows.length;
    if (skippedNoPassword > 0) {
      console.log(`[playwright-launch-all] 跳过 ${skippedNoPassword} 个无密码员工（仅目标派件员）`);
    }

    // 筛选需要启动的窗口（offline / closed / failed）
    const toLaunch = loginCapableWindows.map(w => {
      const staffName = w.employeeName || w.windowName;
      const windowId = `staff-${staffName}`;
      const runtimeKey = buildRuntimeKey(DEFAULT_TENANT_ID, siteCode, windowId);
      const cached = runtime.getWindowStateJSON(runtimeKey);
      const pwStatus = cached?.status;
      const needsLaunch =
        !cached ||
        pwStatus === 'closed' ||
        pwStatus === 'error' ||
        pwStatus === 'launching' && (Date.now() - cached.lastUpdated > 60_000); // 启动卡住超过 60s 视为需要重启
      return { windowName: w.windowName, staffName, windowId, runtimeKey, needsLaunch, cached };
    });

    const launchTargets = toLaunch.filter(t => t.needsLaunch);
    console.log(`[playwright-launch-all] siteId=${siteId} total=${totalWindows} toLaunch=${launchTargets.length}`);

    const results: {
      windowName: string;
      staffName: string;
      runtimeKey: string;
      status: string;
      ready: boolean;
      message?: string;
    }[] = [];

    let launched = 0;
    let failed = 0;
    let ready = 0;

    // 串行启动（避免并发启动多个 Chrome 实例导致资源竞争）
    for (const target of launchTargets) {
      try {
        const r = await adapter.ensureWindowReady({
          tenantId: DEFAULT_TENANT_ID,
          siteId: siteCode,
          windowId: target.windowId,
          staffName: target.staffName,
          siteName: site.name,
          windowName: target.windowName,
        });

        // Phase 4-B：adapter 不 autoLogin，login_required 时由本路由层触发 manualLogin
        const loginUpdate = await tryAutoLoginAfterEnsure(
          { runtimeKey: r.runtimeKey, status: r.status, launched: r.launched },
          target.staffName,
          site.name,
        );
        const finalStatus = loginUpdate.status;

        const isReady = finalStatus === 'ready';
        if (isReady) ready++;
        if (r.launched) launched++;
        results.push({
          windowName: target.windowName,
          staffName: target.staffName,
          runtimeKey: target.runtimeKey,
          status: finalStatus,
          ready: isReady,
          message: loginUpdate.loginMessage || r.message,
        });
        console.log(`[playwright-launch-all] ${target.staffName} ensure=${r.status} final=${finalStatus} launched=${r.launched} ready=${isReady}`);
      } catch (e) {
        failed++;
        const errMsg = (e as Error).message;
        results.push({
          windowName: target.windowName,
          staffName: target.staffName,
          runtimeKey: target.runtimeKey,
          status: 'failed',
          ready: false,
          message: errMsg,
        });
        console.error(`[playwright-launch-all] ${target.staffName} 启动失败: ${errMsg}`);
      }
    }

    // 已就绪窗口（无需启动）也计入 ready
    for (const t of toLaunch.filter(t => !t.needsLaunch)) {
      const status = mapAdapterToFrontend(
        (() => {
          switch (t.cached!.status) {
            case 'launching':
            case 'logging_in': return 'opening';
            case 'ready': return 'ready';
            case 'busy': return 'busy';
            case 'login_required': return 'login_required';
            case 'closed': return 'closed';
            case 'error': return 'failed';
            default: return 'failed';
          }
        })(),
      );
      if (status === 'ready') ready++;
      results.push({
        windowName: t.windowName,
        staffName: t.staffName,
        runtimeKey: t.runtimeKey,
        status,
        ready: status === 'ready',
      });
    }

    const success = failed === 0 && ready === totalWindows;
    const message = failed > 0
      ? `启动完成（成功 ${launched}，失败 ${failed}）`
      : `启动完成（已就绪 ${ready}/${totalWindows}）`;

    res.json({
      launched,
      failed,
      partial: failed > 0 ? 1 : 0,
      total: totalWindows,
      timeout: false,
      success,
      message,
      windows: results,
      runtimeMode: 'playwright' as const,
    });
  } catch (e) {
    console.error(`[POST /api/sites/${req.params.siteId}/playwright-windows/launch-all] 失败:`, (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/sites/:siteId/playwright-windows/ensure — 单窗口 ensure-ready
// ═══════════════════════════════════════════════════════════
// Body: { staffName }
// 启动单个员工的 Chrome 窗口（headed=true, keepOpen=true 由 adapter 保证）
windowRuntimeRouter.post('/api/sites/:siteId/playwright-windows/ensure', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { staffName } = req.body || {};
    if (!staffName || typeof staffName !== 'string') {
      return res.status(400).json({ error: '缺少 staffName 参数' });
    }

    const sm = SettingsManager.getInstance();
    const config = await sm.getConfig();
    const site = config.sites.find(s => s.id === siteId);
    if (!site) {
      return res.status(404).json({ error: `网点 ${siteId} 未配置` });
    }

    const siteCode = normalizeSiteNameToCode(site.name);
    const windowId = `staff-${staffName}`;
    const runtimeKey = buildRuntimeKey(DEFAULT_TENANT_ID, siteCode, windowId);

    // 查找窗口配置（用于 windowName）
    const w = site.windows.find(win => (win.employeeName || win.windowName) === staffName);

    // ★ Phase 4-C: 无密码员工不能作为执行窗口启动
    if (w && !isLoginCapableWindow(w)) {
      return res.status(400).json({
        error: '该员工未配置登录密码，不能作为执行窗口启动',
        staffName,
        success: false,
        launched: false,
      });
    }

    const result = await adapter.ensureWindowReady({
      tenantId: DEFAULT_TENANT_ID,
      siteId: siteCode,
      windowId,
      staffName,
      siteName: site.name,
      windowName: w?.windowName,
    });

    // Phase 4-B：adapter 不 autoLogin，login_required 时由本路由层触发 manualLogin
    const loginUpdate = await tryAutoLoginAfterEnsure(
      { runtimeKey: result.runtimeKey, status: result.status, launched: result.launched },
      staffName,
      site.name,
    );
    const finalStatus = loginUpdate.status;

    // ★ Phase 4-B READY 守卫：登录成功后显式触发 P0 检查（确保 ready 状态有 P0 背书）
    // manualLogin 成功后状态变为 ready，但 P0 未校验，需要显式跑 P0
    if (finalStatus === 'ready') {
      console.log(`[playwright-ensure] ${staffName} 登录后状态 ready，触发 P0 守卫检查...`);
      const p0Report = await runtime.runP0Check(runtimeKey).catch(e => {
        console.error(`[playwright-ensure] ${staffName} P0 检查异常: ${(e as Error).message}`);
        return null;
      });
      if (p0Report && !p0Report.passed) {
        // P0 failed → 不返回 ready
        const failedStatus = p0Report.failedCheck === 'url_login' ? 'login_required' : 'degraded';
        console.warn(`[playwright-ensure] ${staffName} P0 未通过 → ${failedStatus} (${p0Report.failedCheck})`);
        // 重新读取 state（runP0Check 已更新诊断字段）
        const failedState = runtime.getWindowStateJSON(runtimeKey);
        return res.json({
          success: false,
          runtimeKey,
          status: failedStatus,
          ready: false,
          launched: result.launched,
          currentUrl: p0Report.endUrl,
          isLoggedIn: false,
          message: `P0 未通过: ${p0Report.failedCheck} - ${p0Report.failedReason}`,
          runtimeMode: 'playwright' as const,
          pageCount: failedState?.pageCount ?? 0,
          activePageUrl: failedState?.activePageUrl ?? p0Report.endUrl,
          p0Passed: false,
          p0FailedCheck: p0Report.failedCheck,
          p0FailedReason: p0Report.failedReason,
        });
      }
    }

    // 读取最新 state（含 P0 诊断字段）
    const finalState = runtime.getWindowStateJSON(runtimeKey);

    console.log(`[playwright-ensure] staffName=${staffName} ensure=${result.status} final=${finalStatus} launched=${result.launched} ready=${finalStatus === 'ready'} p0Passed=${finalState?.p0Passed ?? false}`);

    res.json({
      success: finalStatus === 'ready' || finalStatus === 'login_required' || finalStatus === 'busy',
      runtimeKey,
      status: finalStatus,
      ready: finalStatus === 'ready',
      launched: result.launched,
      currentUrl: finalState?.currentUrl ?? result.currentUrl,
      isLoggedIn: finalState?.isLoggedIn ?? result.isLoggedIn,
      message: loginUpdate.loginMessage || result.message,
      runtimeMode: 'playwright' as const,
      // ★ Phase 4-B READY 守卫诊断字段
      pageCount: finalState?.pageCount ?? 0,
      activePageUrl: finalState?.activePageUrl ?? '',
      p0Passed: finalState?.p0Passed ?? false,
      p0FailedCheck: finalState?.p0FailedCheck ?? null,
      p0FailedReason: finalState?.p0FailedReason ?? null,
    });
  } catch (e) {
    console.error(`[POST /api/sites/${req.params.siteId}/playwright-windows/ensure] 失败:`, (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/sites/:siteId/playwright-windows/close — Phase 4-D 关闭窗口
// ═══════════════════════════════════════════════════════════
// Body: { staffName }
// 关闭指定员工的 Chrome 窗口（仅关闭浏览器窗口，不删除配置）
windowRuntimeRouter.post('/api/sites/:siteId/playwright-windows/close', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { staffName } = req.body || {};
    if (!staffName || typeof staffName !== 'string') {
      return res.status(400).json({ error: '缺少 staffName 参数' });
    }

    const sm = SettingsManager.getInstance();
    const config = await sm.getConfig();
    const site = config.sites.find(s => s.id === siteId);
    if (!site) {
      return res.status(404).json({ error: `网点 ${siteId} 未配置` });
    }

    const siteCode = normalizeSiteNameToCode(site.name);
    const windowId = `staff-${staffName}`;
    const runtimeKey = buildRuntimeKey(DEFAULT_TENANT_ID, siteCode, windowId);

    // 检查是否为 busy 状态
    const state = runtime.getWindowStateJSON(runtimeKey);
    if (state?.status === 'busy') {
      return res.status(409).json({
        success: false,
        error: `窗口 ${staffName} 正在执行任务，不能关闭`,
      });
    }

    const result = await runtime.closeWindow(runtimeKey);
    console.log(`[POST /playwright-windows/close] ${staffName} runtimeKey=${runtimeKey} success=${result.success} alreadyClosed=${result.alreadyClosed}`);

    res.json({
      success: result.success,
      alreadyClosed: result.alreadyClosed ?? false,
      status: result.status,
    });
  } catch (e) {
    console.error(`[POST /api/sites/${req.params.siteId}/playwright-windows/close] 失败:`, (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});
