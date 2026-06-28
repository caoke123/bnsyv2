import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, ChevronDown, RotateCw, X, RefreshCw, AlertTriangle, Monitor,
} from 'lucide-react';
import {
  initWindow,
  launchAllWindows,
  launchAllPlaywrightWindows,
  ensurePlaywrightWindow,
  getTaskProgress,
  openBrowser,
  toggleWindow,
  closePlaywrightWindow,
  reconnectEasyBR,
  type SiteWindowState,
  type PlaywrightSiteWindowState,
  type WindowState,
} from '../../api/client';
import { useWindowState } from '../shared/WindowStateProvider';
import { useTaskExecution } from '../shared/TaskExecutionContext';

// ═══════ VERSION: v7 — Phase 4-B READY 守卫（收紧 READY 定义） ═══════
// playwright 模式：READY 必须满足 p0Passed===true && pageCount===1 && URL 是 bnsy dashboard
//   若 status='ready' 但 P0 未通过/多标签页/about:blank → 显示 "不稳定"（degraded 橙色）
// legacy_easybr 模式：保留原 GET /api/sites/:siteId/windows + EasyBR 启动逻辑

/** Phase 4-B：playwright 模式下的真实 READY 判断（10 项条件收严） */
function isPlaywrightReallyReady(sw: PlaywrightSiteWindowState): boolean {
  if (sw.status !== 'ready') return false;
  if (sw.p0Passed !== true) return false;
  if (sw.pageCount !== 1) return false;
  const url = sw.currentUrl ?? sw.activePageUrl ?? '';
  if (!url) return false;
  if (url === 'about:blank') return false;
  if (!url.includes('bnsy.benniaosuyun.com')) return false;
  if (url.includes('/login')) return false;
  return true;
}

interface HeaderProps {
  sidebarCollapsed?: boolean;
}

export default function Header({ sidebarCollapsed }: HeaderProps) {
  const [time, setTime] = useState(new Date());

  // ── 统一状态（来自 WindowStateProvider） ──
  const {
    sites, activeSiteId, setActiveSiteId,
    siteWindows, siteName, easybrAbnormal, easybrMessage,
    refresh: fetchSiteWindows,
    configError,
    runtimeMode, isPlaywright,
  } = useWindowState();

  // ★ P0 安全加固：任务运行中禁止切换站点，防止 UI 当前站点与运行中任务错位
  const { liveStatus } = useTaskExecution();

  // ── 初始化中窗口映射 (windowName → taskId) ──
  const [showSiteSwitcher, setShowSiteSwitcher] = useState(false);
  const [initializingTasks, setInitializingTasks] = useState<Map<string, string>>(new Map());
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState('');
  const [reconnecting, setReconnecting] = useState(false);

  // ── Phase 4-D: 悬浮窗口名（用于显示关闭按钮）──
  const [hoveredWindow, setHoveredWindow] = useState<string | null>(null);

  // polling refs
  const taskPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const launchMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [launchCooldown, setLaunchCooldown] = useState(false);

  // ── 轮询初始化中任务状态（仅以task.status为依据，不做前端超时熔断） ──
  // playwright 模式的 'pw-ensure' 条目为同步 ensure 调用，不走任务轮询
  const pollInitTasks = useCallback(async () => {
    if (initializingTasks.size === 0) return;

    const pending = new Map(initializingTasks);

    for (const [windowName, taskId] of pending) {
      if (!taskId) continue;
      // playwright 模式单窗口 ensure 不产生 taskId，跳过轮询（由 finally 块清除标记）
      if (taskId.startsWith('pw-')) continue;

      try {
        const progress = await getTaskProgress(taskId);
        if (progress.status === 'done' || progress.status === 'failed' || progress.status === 'cancelled') {
          setInitializingTasks(prev => {
            const next = new Map(prev);
            next.delete(windowName);
            return next;
          });
          fetchSiteWindows();
        }
      } catch { /* 继续轮询 */ }
    }
  }, [initializingTasks, fetchSiteWindows]);

  useEffect(() => {
    taskPollRef.current = setInterval(pollInitTasks, 3000);
    return () => {
      if (taskPollRef.current) clearInterval(taskPollRef.current);
    };
  }, [pollInitTasks]);

  // ★ Phase 4-D-Fix2: TTL 自动释放 — 当 siteWindows 更新时，
  //   若某窗口的后端状态已是 ready/offline/busy，则自动清除其 initializingTasks 条目
  //   防止本地 initializing 标记永久卡住
  useEffect(() => {
    setInitializingTasks(prev => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const windowName of prev.keys()) {
        const sw = siteWindows.find(w => w.windowName === windowName);
        if (sw && (sw.status === 'ready' || sw.status === 'offline' || sw.status === 'busy')) {
          next.delete(windowName);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [siteWindows]);

  // ── 时钟 ──
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── 显示提示后自动清除 ──
  useEffect(() => {
    if (launchMsg) {
      launchMsgTimer.current = setTimeout(() => setLaunchMsg(''), 5000);
      return () => {
        if (launchMsgTimer.current) clearTimeout(launchMsgTimer.current);
      };
    }
  }, [launchMsg]);

  useEffect(() => {
    return () => {
      if (launchCooldownRef.current) clearTimeout(launchCooldownRef.current);
    };
  }, []);

  // ── 派生数据 ──
  const activeSite = sites.find(s => s.id === activeSiteId);
  const displaySiteName = activeSite?.name || siteName || activeSiteId;

  // ── 获取单个窗口的显示状态（考虑初始化中 + Phase 4-B READY 守卫） ──
  // playwright 模式下：若 status='ready' 但 P0 未通过/多标签页/about:blank
  //   → 降级显示 'degraded'（橙色"不稳定"），避免误判为可执行
  //
  // ★ Phase 4-D-Fix2 优先级调整：
  //   执行节点（ScanWorkbench/SignPage）直接使用 w.status，不检查 initializingTasks
  //   Header 之前用 initializingTasks 覆盖 w.status，导致两者显示不一致
  //   修复：后端 READY > 本地 initializing（后端是权威源，本地 initializing 只用于非 ready 态）
  const getEffectiveStatus = (w: SiteWindowState): WindowState | 'initializing' => {
    // ★ Phase 4-D-Fix2: 后端 ready 优先于本地 initializing
    //   执行节点直接读 w.status，Header 不得用 initializing 覆盖 ready
    if (w.status === 'ready') {
      if (isPlaywright) {
        const pw = w as PlaywrightSiteWindowState;
        if (!isPlaywrightReallyReady(pw)) {
          const url = pw.currentUrl ?? pw.activePageUrl ?? '';
          if (url.includes('/login') || pw.p0FailedCheck === 'url_login') {
            return 'login_required';
          }
          return 'degraded';
        }
      }
      // 后端确认为 ready → 直接返回，不检查 initializingTasks
      return 'ready';
    }
    // 后端非 ready（如 offline/connecting/degraded/busy）→ 本地 initializing 才覆盖
    if (initializingTasks.has(w.windowName)) return 'initializing';
    return w.status;
  };

  // ── 单点初始化窗口 ──
  const handleInitWindow = async (sw: SiteWindowState) => {
    const staffName = sw.employeeName || sw.windowName;

    // playwright 模式：走 adapter.ensureWindowReady（headed=true, keepOpen=true）
    if (isPlaywright) {
      // ★ Phase 4-D-Polish: 清除标记的辅助函数
      const clearInitMark = () => {
        setInitializingTasks(prev => {
          const next = new Map(prev);
          next.delete(sw.windowName);
          return next;
        });
      };

      setInitializingTasks(prev => new Map(prev).set(sw.windowName, 'pw-ensure'));
      try {
        const res = await ensurePlaywrightWindow(activeSiteId, staffName);
        setLaunchMsg(
          res.ready ? `Chrome 已就绪：${staffName}`
          : res.status === 'login_required' ? `需登录：${staffName}`
          : res.status === 'busy' ? `窗口执行中：${staffName}`
          : `启动中：${staffName} (${res.status})`,
        );
        // Phase 4-D-Polish: 先清除初始化标记，再拉取最新状态
        // 否则 getEffectiveStatus 会把 ready 的窗口覆盖为 'initializing'
        clearInitMark();
        await fetchSiteWindows();
      } catch (e) {
        console.error(`[playwright-ensure] ${sw.windowName} 启动失败:`, e);
        setLaunchMsg(`Chrome 启动失败 ${staffName}: ${(e as Error).message}`);
        clearInitMark();
      }
      return;
    }

    // legacy 模式：原 EasyBR initWindow 流程
    if (!sw.browserId) {
      setLaunchMsg(`窗口 ${staffName} 未匹配到EasyBR浏览器配置，请先在EasyBR中创建对应浏览器窗口`);
      return;
    }
    setInitializingTasks(prev => new Map(prev).set(sw.windowName, ''));
    try {
      const res = await initWindow(activeSiteId, sw.browserId);
      setInitializingTasks(prev => new Map(prev).set(sw.windowName, res.taskId));
    } catch (e) {
      console.error(`初始化窗口 ${sw.windowName} 失败:`, e);
      setInitializingTasks(prev => {
        const next = new Map(prev);
        next.delete(sw.windowName);
        return next;
      });
      setLaunchMsg(`窗口 ${sw.employeeName} 启动失败: ${(e as Error).message}`);
    }
  };

  // ── 一键启动 ──
  const handleLaunchAll = async () => {
    if (launching || launchCooldown || !activeSiteId) return;
    if (launchCooldownRef.current) {
      clearTimeout(launchCooldownRef.current);
      launchCooldownRef.current = null;
    }
    setLaunching(true);
    setLaunchMsg('');
    try {
      // playwright 模式：走 adapter.ensureWindowReady（不依赖 EasyBR）
      // legacy 模式：走原 EasyBR launch-all
      const res = isPlaywright
        ? await launchAllPlaywrightWindows(activeSiteId)
        : await launchAllWindows(activeSiteId);
      setLaunchMsg(res.message);
      // Phase 4-D-Polish: await 确保状态立即同步，不等下一轮 polling
      await fetchSiteWindows();

      if (res.timeout || (res.failed === 0 && res.partial > 0 && res.launched === 0)) {
        setLaunchCooldown(true);
        launchCooldownRef.current = setTimeout(() => {
          setLaunchCooldown(false);
          launchCooldownRef.current = null;
        }, 12000);
        setLaunching(false);
        return;
      }

      if (res.partial > 0 || res.failed > 0) {
        setLaunchCooldown(true);
        launchCooldownRef.current = setTimeout(() => {
          setLaunchCooldown(false);
          launchCooldownRef.current = null;
        }, 5000);
      }
    } catch (e) {
      const msg = (e as Error).message || '请求失败';
      setLaunchMsg(`启动失败: ${msg}`);
      console.error('[Header] 一键启动失败:', e);
      setLaunchCooldown(true);
      launchCooldownRef.current = setTimeout(() => {
        setLaunchCooldown(false);
        launchCooldownRef.current = null;
      }, 3000);
    } finally {
      setLaunching(false);
    }
  };

  // ── 手动重连 EasyBR ──
  const handleReconnectEasyBR = async () => {
    if (reconnecting) return;
    setReconnecting(true);
    setLaunchMsg('');
    try {
      const res = await reconnectEasyBR();
      if (res.ok) {
        setLaunchMsg('EasyBR 重连成功');
      } else {
        setLaunchMsg(`EasyBR 重连失败: ${res.message}`);
      }
      fetchSiteWindows();
    } catch (e) {
      const msg = (e as Error).message || '请求失败';
      setLaunchMsg(`重连失败: ${msg}`);
      console.error('[Header] EasyBR 重连失败:', e);
    } finally {
      setReconnecting(false);
    }
  };

  // ── 关闭窗口（优雅关闭，设置manuallyClosed标记） ──
  const handleCloseWindow = async (sw: SiteWindowState, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isPlaywright) {
        const staffName = sw.employeeName || sw.windowName;
        await closePlaywrightWindow(activeSiteId, staffName);
      } else {
        if (!sw.browserId) return;
        await toggleWindow(sw.browserId);
      }
      // Phase 4-D-Polish: await 确保状态立即同步，不等下一轮 polling
      await fetchSiteWindows();
    } catch (err) {
      console.error('[Header] 关闭窗口失败:', err);
      const name = sw.employeeName || sw.windowName;
      setLaunchMsg(`关闭 ${name} 失败: ${(err as Error).message}`);
    }
  };

  // ── 状态 → 颜色映射 ──
  // ★ login_required 态（需要登录）映射为黄色
  //   connected/connecting 态（窗口已打开但 P0 未验证完成）映射为蓝色脉冲"启动中"
  //   degraded 态（URL/DOM 临时异常但 CDP 在线）映射为橙色警告
  const statusColor: Record<string, string> = {
    offline: 'bg-text-tertiary',
    connecting: 'bg-primary animate-pulse',
    login_required: 'bg-yellow-500',
    connected: 'bg-primary animate-pulse',
    ready: 'bg-success',
    busy: 'bg-warning',
    degraded: 'bg-orange-500',
    initializing: 'bg-primary animate-pulse',
  };

  const statusLabel: Record<string, string> = {
    offline: '离线',
    connecting: '启动中',
    login_required: '待登录',
    connected: '启动中',
    ready: '就绪',
    busy: '执行中',
    degraded: '不稳定',
    initializing: '启动中',
  };

  // ── 渲染 ──
  const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  // ★ Phase 4-B：playwright 模式下，offline/degraded/login_required 均视为需启动
  //   （degraded 可能是 about:blank/多标签页，点击一键启动会触发 ensure 收敛）
  const hasDisconnected = isPlaywright
    ? siteWindows.some(w => w.status === 'offline' || w.status === 'degraded' || w.status === 'login_required')
    : siteWindows.some(w => w.status === 'offline');

  return (
    <header className="topbar h-header">

      {/* ━━━━━ Zone A: 品牌区 ━━━━━ */}
      <div className={`topbar-brand ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="topbar-brand-mark">B</div>
        <div>
          <div className="topbar-brand-name">网点操作中心</div>
        </div>
      </div>

      {/* ━━━━━ Zone B: 中部状态区 ━━━━━ */}
      <div className="topbar-mid">

        {/* 配置加载失败提示 */}
        {configError && (
          <span className="text-[11px] text-danger font-mono">
            无法连接后端服务
          </span>
        )}

        {/* 网点切换下拉 */}
        {sites.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowSiteSwitcher(!showSiteSwitcher)}
              className="btn-ghost gap-2"
            >
              <span className="max-w-[100px] truncate">{displaySiteName}</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showSiteSwitcher ? 'rotate-180' : ''}`}
              />
            </button>

            {showSiteSwitcher && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSiteSwitcher(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-surface border border-border rounded-card shadow-panel overflow-hidden min-w-[160px]">
                  {sites.map((site, idx) => (
                    <button
                      key={site.id}
                      onClick={() => {
                        // ★ P0 安全加固：任务运行中禁止切换站点
                        if (liveStatus === 'running') {
                          setLaunchMsg('当前任务正在运行，请等待任务完成后再切换网点');
                          setShowSiteSwitcher(false);
                          return;
                        }
                        setActiveSiteId(site.id);
                        setShowSiteSwitcher(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-[12px] transition-colors ${
                        site.id === activeSiteId
                          ? 'bg-primary-light text-primary font-medium'
                          : 'text-text-secondary hover:bg-surface-light'
                      }`}
                    >
                      <span className="truncate">{site.name}</span>
                      <span className="text-[10px] text-text-tertiary shrink-0 ml-3">{site.windows.length} 个窗口</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 窗口标签：设置中心配置的所有窗口（仅显示员工姓名，站点名已在左侧选择器） */}
        {siteWindows.length === 0 ? (
          <span className="text-[11px] text-text-tertiary shrink-0">暂无窗口配置</span>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            {siteWindows.map(sw => {
          const effectiveStatus = getEffectiveStatus(sw);
          const displayName = sw.employeeName || sw.windowName;
          const fullLabel = `${displaySiteName} - ${displayName}`;
          const isOffline = effectiveStatus === 'offline';
          const isInitializing = effectiveStatus === 'initializing';
          // Phase 4-D: playwright 模式检查 runtimeKey，EasyBR 模式检查 browserId
          const hasBrowserId = isPlaywright ? !!(sw as PlaywrightSiteWindowState).runtimeKey : !!sw.browserId;

          return (
            <span
              key={sw.windowName}
              className={`window-pill relative ${effectiveStatus === 'ready' ? 'online' : ''} ${effectiveStatus === 'connected' ? 'connected' : ''} ${effectiveStatus === 'connecting' ? 'connecting' : ''} ${effectiveStatus === 'login_required' ? 'login-required' : ''} ${effectiveStatus === 'initializing' ? 'initializing' : ''} ${effectiveStatus === 'busy' ? 'busy' : ''} ${effectiveStatus === 'offline' ? 'offline' : ''} ${effectiveStatus === 'degraded' ? 'degraded' : ''}`}
              onMouseEnter={() => setHoveredWindow(sw.windowName)}
              onMouseLeave={() => setHoveredWindow(null)}
              onClick={() => {
                if (isInitializing || launching) return;
                // ★ Phase 4-B：playwright 模式下，非 ready 非 busy 状态点击重新 ensure
                //   （支持 about:blank/多标签页 → 点击 → 自动收敛为 1 个业务页）
                if (isPlaywright) {
                  if (effectiveStatus === 'busy' || effectiveStatus === 'ready') return;
                  handleInitWindow(sw);
                  return;
                }
                if (isOffline) {
                  handleInitWindow(sw);
                } else if (hasBrowserId) {
                  // legacy 模式：通过 EasyBR 打开/聚焦窗口
                  openBrowser(sw.browserId!).catch(e => console.error('[Header] 打开窗口失败:', e));
                }
              }}
              title={`${fullLabel}\n状态：${statusLabel[effectiveStatus]}${
                isOffline
                  ? isPlaywright
                    ? '\n点击启动 Chrome 窗口'
                    : (hasBrowserId ? '\n点击启动' : '\n未匹配到EasyBR浏览器，请先在EasyBR中创建')
                  : isPlaywright
                    ? (effectiveStatus === 'ready'
                        ? '\nChrome 窗口已打开'
                        : '\n点击重新检查并收敛标签页')
                    : '\n点击打开窗口，悬停显示关闭按钮'
              }${
                // ★ Phase 4-B：playwright 模式下追加诊断字段
                isPlaywright ? (() => {
                  const pw = sw as PlaywrightSiteWindowState;
                  const url = pw.currentUrl ?? pw.activePageUrl ?? '';
                  const lines: string[] = [];
                  if (url) lines.push(`\nURL: ${url}`);
                  if (typeof pw.pageCount === 'number') lines.push(`\n标签页: ${pw.pageCount}`);
                  if (typeof pw.p0Passed === 'boolean') {
                    lines.push(`\nP0: ${pw.p0Passed ? '通过' : '未通过'}`);
                  }
                  if (pw.p0FailedReason) lines.push(`\n原因: ${pw.p0FailedReason}`);
                  return lines.join('');
                })() : ''
              }`}
              style={{
                cursor: isInitializing
                  ? 'default'
                  : isPlaywright
                    // playwright 模式：非 ready 非 busy 非 initializing 均可点击重新 ensure
                    ? (effectiveStatus === 'ready' || effectiveStatus === 'busy' ? 'default' : 'pointer')
                    : ((isOffline && hasBrowserId) || (!isOffline && hasBrowserId))
                      ? 'pointer'
                      : 'not-allowed',
                width: '78px',
                minWidth: '78px',
                maxWidth: '78px',
                justifyContent: 'center',
              }}
            >
              {/* 状态点 */}
              {effectiveStatus === 'initializing' || launching ? (
                <Loader2 className="w-[10px] h-[10px] text-primary animate-spin shrink-0" />
              ) : (
                <span className={`pip ${statusColor[effectiveStatus]}`} />
              )}
              <span
                className="text-center"
                style={{
                  display: 'inline-block',
                  fontSize: '12px',
                  lineHeight: 1,
                  letterSpacing: displayName.length <= 2 ? '0.12em' : 'normal',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName}
              </span>
              {/* Phase 4-D: 关闭按钮 — 悬浮显示，busy/offline/initializing/无browserId 不显示 */}
              {!isOffline && !isInitializing && hasBrowserId && effectiveStatus !== 'busy' && (
                <button
                  onClick={(e) => handleCloseWindow(sw, e)}
                  title={`关闭 ${fullLabel}`}
                  className="absolute -top-1 -right-1 z-30 h-3.5 w-3.5 rounded-full border border-slate-200 bg-white text-[9px] text-slate-400 leading-none shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-500 transition-colors duration-150"
                  style={{
                    display: hoveredWindow === sw.windowName ? 'inline-flex' : 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none',
                  }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}

            {/* 一键启动按钮 — 仅在有离线窗口时醒目 */}
            {hasDisconnected && (
              <button
                onClick={handleLaunchAll}
                disabled={launching || launchCooldown}
                className={`flex items-center rounded-[6px] text-[11px] font-medium
                  bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0
                  ${(launching || launchCooldown) ? 'gap-1 px-2 py-1' : 'px-2.5 py-1'}`}
                title={launchCooldown ? '窗口启动中，请稍后' : (isPlaywright ? '一键启动该网点所有未就绪 Chrome 窗口' : '一键启动该网点所有未就绪窗口')}
              >
                {(launching || launchCooldown) && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>{launchCooldown ? '启动中...' : (isPlaywright ? '启动 Chrome' : '一键启动')}</span>
              </button>
            )}

          </div>
        )}

        {/* legacy_easybr 模式：EasyBR 状态异常提示 + 手动重连按钮 */}
        {!isPlaywright && easybrAbnormal && (
          <div className="flex items-center gap-1.5 shrink-0" title={easybrMessage}>
            <AlertTriangle className="w-3 h-3 text-warning" />
            <span className="text-[11px] text-warning font-medium">EasyBR 连接异常</span>
            <button
              onClick={handleReconnectEasyBR}
              disabled={reconnecting}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium
                bg-warning/10 text-warning border border-warning/30
                hover:bg-warning/20 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
              title={`${easybrMessage || 'EasyBR 连接异常'}，重启 EasyBR 后点击此按钮立即重连`}
            >
              {reconnecting ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <RefreshCw className="w-2.5 h-2.5" />
              )}
              <span>重连</span>
            </button>
          </div>
        )}

        {/* 启动提示 — 弹性占位 */}
        {launchMsg && (
          <span className="text-[11px] text-text-secondary font-mono truncate">
            {launchMsg}
          </span>
        )}
      </div>

      {/* ━━━━━ Zone C: 右侧工具栏 ━━━━━ */}
      <div className="topbar-right">
        {/* 刷新 + 时钟 */}
        <button
          onClick={fetchSiteWindows}
          className="p-1 rounded hover:bg-surface-light text-text-tertiary transition"
          title="刷新窗口状态"
        >
          <RotateCw className="w-3 h-3" />
        </button>

        <span className="text-[11px] text-text-secondary font-mono">{timeStr}</span>
      </div>
    </header>
  );
}
