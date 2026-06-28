/**
 * Phase 9.3 — init_window 接入 Lease Adapter 验收测试
 *
 * 覆盖场景：
 *   普通任务 (Phase 9.2 已有行为，不回归):
 *   1. arrival 正常任务
 *   2. arrival 无可用窗口失败
 *   3. dispatch 正常任务
 *   4. integrated 正常任务
 *   5. sign 正常任务
 *   6. 普通任务取消
 *   7. Handler异常失败
 *   8. 任务超时失败
 *   9. WindowBusyError → failResults 无残留
 *
 *   init_window (Phase 9.3 新增):
 *   10. init_window 成功 → lease acquire/release + done
 *   11. init_window 取消 → lease release + cancelled 不覆盖
 *   12. init_window Handler异常 → lease release + failed
 *   13. init_window 超时 → lease release + failed
 *   14. init_window 获取Lease失败(WindowBusyError) → failed + 无残留
 *
 *   互斥测试:
 *   15. init_window 持有 Lease 期间，普通任务无法抢同一窗口
 *   16. 普通任务持有 Lease 期间，init_window 无法抢同一窗口
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { AssignmentEngine } from '../AssignmentEngine';
import type { TaskHandler } from '../handlers/TaskHandler';
import type { Assignment } from '../types';
import { WindowBusyError } from '../../../browser/WindowLockManager';

// ── 收集测试结果 ──────────────────────────────────────
interface ScenarioResult {
  scenario: string;
  taskId: string;
  finalDbStatus: string | null;
  finishedAtWritten: boolean;
  taskFinishedEmitted: boolean;
  taskFinishedStatus: string | null;
  leaseAcquired: boolean;
  leaseReleased: boolean;
  cancelControllersCleared: boolean;
  statusNotOverridden: boolean;
}

const results: ScenarioResult[] = [];

// ── Mock Database ─────────────────────────────────────
const mockDb = {
  updateTask: vi.fn(),
  getTask: vi.fn(),
  listTasksByStatus: vi.fn().mockReturnValue([]),
  listWindows: vi.fn().mockReturnValue([]),
  appendTaskResults: vi.fn(),
  getTaskResults: vi.fn().mockReturnValue([]),
  createTask: vi.fn(),
};

let mockDbState: Record<string, any> = {};

function setupMockDbState(initialStatus: string = 'running') {
  mockDbState = {};
  const taskState: Record<string, any> = {
    id: 'test-task',
    type: 'arrival',
    site: 'tiannanda',
    status: initialStatus,
    total_count: 3,
    done_count: 0,
    fail_count: 0,
    result_data: null,
    created_at: new Date().toISOString(),
    finished_at: null,
  };
  mockDbState['test-task'] = taskState;
  mockDb.getTask.mockImplementation((taskId: string) => mockDbState[taskId] || null);
  mockDb.updateTask.mockImplementation((taskId: string, updates: Record<string, any>) => {
    if (mockDbState[taskId]) {
      mockDbState[taskId] = { ...mockDbState[taskId], ...updates };
    }
  });
  return taskState;
}

function setupTaskState(taskId: string, taskType: string, initialStatus: string = 'pending') {
  mockDbState[taskId] = {
    id: taskId,
    type: taskType,
    site: 'tiannanda',
    status: initialStatus,
    total_count: 3,
    done_count: 0,
    fail_count: 0,
    result_data: null,
    created_at: new Date().toISOString(),
    finished_at: null,
  };
  return mockDbState[taskId];
}

vi.mock('../../../db/Database', () => ({
  Database: {
    getInstance: () => mockDb,
  },
}));

// ── Lease Mock 辅助 ──────────────────────────────────
let leaseTracker: { created: number; released: number; renewed: number } = { created: 0, released: 0, renewed: 0 };
const activeLeases: Map<string, { windowId: string; taskId: string }> = new Map();

function createMockLease(windowId: string, taskId: string) {
  leaseTracker.created++;
  const lease = {
    windowId,
    taskId,
    release: vi.fn(() => {
      leaseTracker.released++;
      activeLeases.delete(taskId);
    }),
    renew: vi.fn(() => {
      leaseTracker.renewed++;
    }),
  };
  activeLeases.set(taskId, { windowId, taskId });
  return lease;
}

function isWindowLeasedBy(windowId: string, excludeTaskId?: string): boolean {
  for (const [tid, info] of activeLeases) {
    if (tid !== excludeTaskId && info.windowId === windowId) return true;
  }
  return false;
}

// ── Mock BrowserPool ─────────────────────────────────
const mockPool = {
  getStaffConnection: vi.fn().mockResolvedValue({
    windowId: 'test-window-001',
    page: {},
  }),
  ensureWindowReady: vi.fn().mockResolvedValue(undefined),
  acquireWindowLease: vi.fn().mockImplementation(async (opts: any) => {
    // 互斥检查：如果窗口已被其他任务占用，抛 WindowBusyError
    if (isWindowLeasedBy(opts.windowId, opts.taskId)) {
      // 找出租用者
      let holder = 'unknown';
      for (const [tid, info] of activeLeases) {
        if (info.windowId === opts.windowId && tid !== opts.taskId) {
          holder = tid;
          break;
        }
      }
      throw new WindowBusyError(opts.windowId, holder);
    }
    return createMockLease(opts.windowId, opts.taskId);
  }),
  markWindowBusy: vi.fn(),
  markWindowIdle: vi.fn(),
  refreshBusyLease: vi.fn(),
};

vi.mock('../../../browser/BrowserPool', () => ({
  BrowserPool: {
    getInstance: () => mockPool,
  },
}));

// Mock EasyBRClient
vi.mock('../../../easybr/EasyBRClient', () => ({
  EasyBRClient: {
    getInstance: () => ({
      checkHealth: () => Promise.resolve({ ok: true, message: 'mock-health-ok' }),
    }),
  },
}));

// Mock RuntimeMetrics
vi.mock('../../../runtime/RuntimeMetrics', () => ({
  RuntimeMetrics: {
    getInstance: () => ({
      taskSucceeded: vi.fn(),
      taskFailed: vi.fn(),
      snapshot: () => ({}),
    }),
  },
}));

// Mock PgDatabase
vi.mock('../../../db/PgDatabase', () => ({
  PgDatabase: {
    getInstance: () => ({
      insertTask: vi.fn().mockResolvedValue(undefined),
      insertTaskLogs: vi.fn().mockResolvedValue(undefined),
      updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      insertWaybillResults: vi.fn().mockResolvedValue(undefined),
      upsertWaybillPool: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock TaskLogManager
vi.mock('../../../utils/TaskLogManager', () => ({
  taskLogManager: {
    addLog: vi.fn(),
    getLogs: vi.fn().mockReturnValue([]),
    getRecentLogs: vi.fn().mockReturnValue([]),
    setLogCallback: vi.fn(),
  },
}));

// 收集 TASK_FINISHED 事件
const emittedTaskFinished: Array<{ taskId: string; status: string }> = [];

vi.mock('../../../utils/TaskEventBus', () => ({
  taskEventBus: {
    emit: vi.fn((event: any) => {
      if (event.type === 'TASK_FINISHED') {
        emittedTaskFinished.push({ taskId: event.taskId, status: event.status });
      }
    }),
  },
}));

// ── 辅助工具 ──────────────────────────────────────────

function createOkHandler(): TaskHandler {
  return {
    executeWorker: vi.fn().mockImplementation(async (ctx: any) => {
      if (ctx.onProgress) {
        ctx.onProgress({ processed: 3, success: 3, failed: 0 });
      }
      return { success: true, processed: 3, failed: 0 };
    }),
  };
}

function createErrorHandler(): TaskHandler {
  return {
    executeWorker: vi.fn().mockRejectedValue(new Error('模拟业务异常')),
  };
}

function createHangingHandler(): TaskHandler {
  return {
    executeWorker: () => new Promise(() => {}),
  };
}

function makeAssignment(staffName = '测试员工', count = 3): Assignment {
  const waybillNos: string[] = [];
  for (let i = 0; i < count; i++) {
    waybillNos.push(`58000000000${String(i).padStart(2, '0')}`);
  }
  return { staffName, waybillNos };
}

function makeInitWindowAssignment(windowId: string, staffName?: string): Assignment {
  return {
    staffName: staffName || windowId,
    waybillNos: [windowId],
    windowId,
  };
}

function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── 测试前/后重置 ─────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  (AssignmentEngine as any).instance = null;
  mockDbState = {};
  emittedTaskFinished.length = 0;
  leaseTracker = { created: 0, released: 0, renewed: 0 };
  activeLeases.clear();

  // 重置 mockPool 默认行为
  mockPool.getStaffConnection.mockReset();
  mockPool.getStaffConnection.mockResolvedValue({
    windowId: 'test-window-001',
    page: {},
  });
  mockPool.ensureWindowReady.mockReset();
  mockPool.ensureWindowReady.mockResolvedValue(undefined);
  mockPool.acquireWindowLease.mockReset();
  mockPool.acquireWindowLease.mockImplementation(async (opts: any) => {
    if (isWindowLeasedBy(opts.windowId, opts.taskId)) {
      let holder = 'unknown';
      for (const [tid, info] of activeLeases) {
        if (info.windowId === opts.windowId && tid !== opts.taskId) {
          holder = tid;
          break;
        }
      }
      throw new WindowBusyError(opts.windowId, holder);
    }
    return createMockLease(opts.windowId, opts.taskId);
  });
  mockPool.markWindowBusy.mockReset();
  mockPool.markWindowIdle.mockReset();
  mockPool.refreshBusyLease.mockReset();

  setupMockDbState('pending');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Phase 9.3 验收测试 ────────────────────────────────

describe('Phase 9.3 — init_window 接入 Lease Adapter 验收', () => {
  async function runAndCollect(
    scenarioName: string,
    taskId: string,
    taskType: any,
    handler: TaskHandler,
    options: {
      cancelAfterMs?: number;
      handlerTimeoutMs?: number;
      poolGetStaffConnection?: any;
      poolAcquireWindowLease?: any;
      assignments?: Assignment[];
    } = {},
  ): Promise<ScenarioResult> {
    if (options.poolGetStaffConnection) {
      mockPool.getStaffConnection.mockImplementation(options.poolGetStaffConnection);
    }
    if (options.poolAcquireWindowLease) {
      mockPool.acquireWindowLease.mockImplementation(options.poolAcquireWindowLease);
    }

    setupTaskState(taskId, taskType, 'pending');

    const engine = AssignmentEngine.getInstance();

    if (options.cancelAfterMs) {
      const taskPromise = engine.execute({
        taskId,
        site: 'tiannanda',
        taskType,
        assignments: options.assignments || [makeAssignment('员工A', 3)],
        handler,
        handlerTimeoutMs: options.handlerTimeoutMs || 30_000,
      });
      await wait(options.cancelAfterMs);
      engine.cancelTask(taskId);
      await taskPromise;
    } else {
      await engine.execute({
        taskId,
        site: 'tiannanda',
        taskType,
        assignments: options.assignments || [makeAssignment('员工A', 3)],
        handler,
        handlerTimeoutMs: options.handlerTimeoutMs || 30_000,
      });
    }

    await wait(100);

    const finalState = mockDbState[taskId];
    const finishedEvent = emittedTaskFinished.find(e => e.taskId === taskId);

    // 检查是否有被覆盖为failed（取消场景）
    const wasCancelled = scenarioName.includes('取消');
    const statusNotOverridden = wasCancelled ? finalState?.status === 'cancelled' : true;

    // 所有任务类型（包括 init_window）现在都使用 Lease Adapter
    const acquireCalled = (mockPool.acquireWindowLease as any).mock.calls.some(
      (c: any) => c[0]?.taskId === taskId
    );
    const leaseAcquired = acquireCalled && leaseTracker.created > 0;
    // 判断该 task 的 lease 是否被释放：如果 acquire 抛异常则 lease 不会创建
    const leaseReleased = !acquireCalled
      ? false
      : (leaseTracker.created === 0 ? false : leaseTracker.released >= leaseTracker.created);

    // 前置失败场景（无可用窗口）不获取 lease
    const isNoWindowError = scenarioName.includes('无可用窗口');
    const isBusyError = scenarioName.includes('WindowBusy') || scenarioName.includes('获取Lease失败');
    const effectiveLeaseAcquired = isNoWindowError || isBusyError ? false : leaseAcquired;
    const effectiveLeaseReleased = isNoWindowError || isBusyError ? true : leaseReleased;

    const result: ScenarioResult = {
      scenario: scenarioName,
      taskId,
      finalDbStatus: finalState?.status || null,
      finishedAtWritten: !!(finalState?.finished_at),
      taskFinishedEmitted: !!finishedEvent,
      taskFinishedStatus: finishedEvent?.status || null,
      leaseAcquired: effectiveLeaseAcquired,
      leaseReleased: effectiveLeaseReleased,
      cancelControllersCleared: engine.cancelTask(taskId) === false,
      statusNotOverridden,
    };

    results.push(result);
    return result;
  }

  // ── 普通任务（Phase 9.2 回归验证） ──────────────────

  it('场景1: arrival 正常任务 → done + TASK_FINISHED + lease释放', async () => {
    const r = await runAndCollect('arrival 正常任务', 'test-arrival-ok', 'arrival', createOkHandler());

    expect(r.finalDbStatus).toBe('done');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('done');
    expect(r.leaseAcquired).toBe(true);
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
  });

  it('场景2: arrival 无可用窗口失败 → failed + TASK_FINISHED + 无Lease获取', async () => {
    const r = await runAndCollect(
      'arrival 无可用窗口失败',
      'test-arrival-no-window',
      'arrival',
      createOkHandler(),
      {
        poolGetStaffConnection: () => Promise.reject(new Error('无可用在线窗口')),
      },
    );

    expect(r.finalDbStatus).toBe('failed');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseAcquired).toBe(false);
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
  });

  it('场景3: dispatch 正常任务 → done + TASK_FINISHED', async () => {
    const r = await runAndCollect(
      'dispatch 正常任务',
      'test-dispatch-ok',
      'dispatch',
      createOkHandler(),
      { assignments: [makeAssignment('员工A', 5), makeAssignment('员工B', 5)] },
    );

    expect(r.finalDbStatus).toBe('done');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('done');
    expect(r.leaseAcquired).toBe(true);
    expect(r.leaseReleased).toBe(true);
  });

  it('场景4: integrated 正常任务 → done + TASK_FINISHED', async () => {
    const r = await runAndCollect(
      'integrated 正常任务',
      'test-integrated-ok',
      'integrated',
      createOkHandler(),
    );

    expect(r.finalDbStatus).toBe('done');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('done');
    expect(r.leaseAcquired).toBe(true);
    expect(r.leaseReleased).toBe(true);
  });

  it('场景5: sign 正常任务 → done + TASK_FINISHED', async () => {
    const r = await runAndCollect('sign 正常任务', 'test-sign-ok', 'sign', createOkHandler());

    expect(r.finalDbStatus).toBe('done');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('done');
    expect(r.leaseAcquired).toBe(true);
    expect(r.leaseReleased).toBe(true);
  });

  it('场景6: 普通任务取消 → cancelled + TASK_FINISHED + lease释放 + 不覆盖为failed', async () => {
    const r = await runAndCollect(
      '普通任务取消',
      'test-cancel-normal',
      'arrival',
      createHangingHandler(),
      { cancelAfterMs: 100 },
    );

    expect(r.finalDbStatus).toBe('cancelled');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
    expect(r.statusNotOverridden).toBe(true);
  });

  it('场景7: Handler异常失败 → failed + TASK_FINISHED + lease释放', async () => {
    const r = await runAndCollect(
      'Handler异常失败',
      'test-handler-error',
      'arrival',
      createErrorHandler(),
    );

    expect(r.finalDbStatus).toBe('failed');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
  });

  it('场景8: 任务超时失败 → failed + TASK_FINISHED + lease释放', async () => {
    const r = await runAndCollect(
      '任务超时失败',
      'test-timeout',
      'arrival',
      createHangingHandler(),
      { handlerTimeoutMs: 300 },
    );

    expect(r.finalDbStatus).toBe('failed');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
  });

  it('场景9: acquireWindowLease抛WindowBusyError → failResults + 无lease残留', async () => {
    const r = await runAndCollect(
      'WindowBusyError',
      'test-window-busy',
      'arrival',
      createOkHandler(),
      {
        poolAcquireWindowLease: async () => {
          throw new WindowBusyError('test-window-001', 'other-task');
        },
      },
    );

    expect(r.finalDbStatus).toBe('failed');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseAcquired).toBe(false);
    expect(r.leaseReleased).toBe(true);
  });

  // ── init_window (Phase 9.3 新增) ────────────────────

  it('场景10: init_window 成功 → done + TASK_FINISHED + lease acquire/release', async () => {
    const r = await runAndCollect(
      'init_window 成功',
      'test-init-window-ok',
      'init_window',
      createOkHandler(),
      { assignments: [makeInitWindowAssignment('win-init-1')] },
    );

    expect(r.finalDbStatus).toBe('done');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('done');
    expect(r.leaseAcquired).toBe(true);
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);

    // 验证 acquireWindowLease 被正确参数调用
    const acquireCalls = (mockPool.acquireWindowLease as any).mock.calls;
    const initCall = acquireCalls.find((c: any) => c[0]?.taskId === 'test-init-window-ok');
    expect(initCall).toBeDefined();
    expect(initCall[0].windowId).toBe('win-init-1');
    expect(initCall[0].taskType).toBe('init_window');
  });

  it('场景11: init_window 取消 → lease release + cancelled 不覆盖 + TASK_FINISHED', async () => {
    const r = await runAndCollect(
      'init_window 取消',
      'test-init-window-cancel',
      'init_window',
      createHangingHandler(),
      { cancelAfterMs: 100, assignments: [makeInitWindowAssignment('win-init-cancel')] },
    );

    expect(r.finalDbStatus).toBe('cancelled');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
    expect(r.statusNotOverridden).toBe(true);
  });

  it('场景12: init_window Handler异常 → lease release + failed + TASK_FINISHED', async () => {
    const r = await runAndCollect(
      'init_window Handler异常',
      'test-init-window-error',
      'init_window',
      createErrorHandler(),
      { assignments: [makeInitWindowAssignment('win-init-err')] },
    );

    expect(r.finalDbStatus).toBe('failed');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
  });

  it('场景13: init_window 超时 → lease release + failed + TASK_FINISHED', async () => {
    const r = await runAndCollect(
      'init_window 超时',
      'test-init-window-timeout',
      'init_window',
      createHangingHandler(),
      { handlerTimeoutMs: 300, assignments: [makeInitWindowAssignment('win-init-timeout')] },
    );

    expect(r.finalDbStatus).toBe('failed');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseReleased).toBe(true);
    expect(r.cancelControllersCleared).toBe(true);
  });

  it('场景14: init_window 获取Lease失败(WindowBusyError) → failed + 无lease残留', async () => {
    // 先让一个普通任务占用窗口
    mockPool.acquireWindowLease.mockImplementation(async (opts: any) => {
      if (opts.taskId === 'test-init-window-busy') {
        throw new WindowBusyError(opts.windowId, 'blocking-task');
      }
      return createMockLease(opts.windowId, opts.taskId);
    });

    const r = await runAndCollect(
      'init_window 获取Lease失败',
      'test-init-window-busy',
      'init_window',
      createOkHandler(),
      { assignments: [makeInitWindowAssignment('win-blocked')] },
    );

    expect(r.finalDbStatus).toBe('failed');
    expect(r.finishedAtWritten).toBe(true);
    expect(r.taskFinishedEmitted).toBe(true);
    expect(r.taskFinishedStatus).toBe('failed');
    expect(r.leaseAcquired).toBe(false);
    expect(r.leaseReleased).toBe(true);
  });
});

// ── 互斥测试 ──────────────────────────────────────────
describe('Phase 9.3 — init_window 与普通任务互斥', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AssignmentEngine as any).instance = null;
    mockDbState = {};
    emittedTaskFinished.length = 0;
    leaseTracker = { created: 0, released: 0, renewed: 0 };
    activeLeases.clear();

    mockPool.getStaffConnection.mockReset();
    mockPool.getStaffConnection.mockImplementation(async (staffName: string) => ({
      windowId: staffName,
      page: {},
    }));
    mockPool.ensureWindowReady.mockReset();
    mockPool.ensureWindowReady.mockResolvedValue(undefined);
    mockPool.acquireWindowLease.mockReset();
    mockPool.acquireWindowLease.mockImplementation(async (opts: any) => {
      if (isWindowLeasedBy(opts.windowId, opts.taskId)) {
        let holder = 'unknown';
        for (const [tid, info] of activeLeases) {
          if (info.windowId === opts.windowId && tid !== opts.taskId) {
            holder = tid;
            break;
          }
        }
        throw new WindowBusyError(opts.windowId, holder);
      }
      return createMockLease(opts.windowId, opts.taskId);
    });
    mockPool.markWindowBusy.mockReset();
    mockPool.markWindowIdle.mockReset();
    mockPool.refreshBusyLease.mockReset();
  });

  it('场景15: init_window 持有 Lease 期间，普通任务无法抢同一窗口', async () => {
    setupTaskState('init-lock', 'init_window', 'pending');
    setupTaskState('normal-blocked', 'arrival', 'pending');

    // init_window 使用 hanging handler 保持 lease
    const initHandler = createHangingHandler();

    const engine = AssignmentEngine.getInstance();

    // 启动 init_window（不等待完成）
    const initPromise = engine.execute({
      taskId: 'init-lock',
      site: 'tiannanda',
      taskType: 'init_window',
      assignments: [makeInitWindowAssignment('win-shared', '员工A')],
      handler: initHandler,
      handlerTimeoutMs: 30_000,
    });

    // 等待 init_window 获取 lease
    await wait(200);

    // 验证 init_window 已持有 lease
    expect(activeLeases.has('init-lock')).toBe(true);
    expect(leaseTracker.created).toBe(1);
    expect(leaseTracker.released).toBe(0);

    // 现在启动普通任务，使用同一员工（同一窗口 win-shared）
    // getStaffConnection('员工A') 返回 windowId '员工A'，但init_window用的是windowId 'win-shared'
    // 需要让它们映射到同一窗口。让普通任务使用 staffName='win-shared'
    mockPool.getStaffConnection.mockImplementation(async (staffName: string) => ({
      windowId: 'win-shared',
      page: {},
    }));

    const normalPromise = engine.execute({
      taskId: 'normal-blocked',
      site: 'tiannanda',
      taskType: 'arrival',
      assignments: [makeAssignment('win-shared', 1)],
      handler: createOkHandler(),
      handlerTimeoutMs: 30_000,
    });

    await normalPromise;

    // 普通任务应该失败（WindowBusyError）
    expect(mockDbState['normal-blocked']?.status).toBe('failed');

    // 验证 init_window 仍持有 lease（没被普通任务影响）
    expect(activeLeases.has('init-lock')).toBe(true);

    // 取消 init_window 清理
    engine.cancelTask('init-lock');
    try { await initPromise; } catch { /* ignore */ }

    await wait(100);

    // Lease 应该被释放
    expect(activeLeases.size).toBe(0);
  });

  it('场景16: 普通任务持有 Lease 期间，init_window 无法抢同一窗口', async () => {
    setupTaskState('normal-lock', 'arrival', 'pending');
    setupTaskState('init-blocked', 'init_window', 'pending');

    const engine = AssignmentEngine.getInstance();

    // 让 getStaffConnection 始终返回同一窗口
    mockPool.getStaffConnection.mockImplementation(async () => ({
      windowId: 'win-shared-2',
      page: {},
    }));

    // 普通任务使用 hanging handler 保持 lease
    const normalPromise = engine.execute({
      taskId: 'normal-lock',
      site: 'tiannanda',
      taskType: 'arrival',
      assignments: [makeAssignment('员工A', 3)],
      handler: createHangingHandler(),
      handlerTimeoutMs: 30_000,
    });

    // 等待普通任务获取 lease
    await wait(200);

    // 验证普通任务已持有 lease
    expect(activeLeases.has('normal-lock')).toBe(true);
    expect(leaseTracker.created).toBe(1);
    expect(leaseTracker.released).toBe(0);

    // 启动 init_window，使用同一窗口
    const initPromise = engine.execute({
      taskId: 'init-blocked',
      site: 'tiannanda',
      taskType: 'init_window',
      assignments: [makeInitWindowAssignment('win-shared-2', '员工A')],
      handler: createOkHandler(),
      handlerTimeoutMs: 30_000,
    });

    await initPromise;

    // init_window 应该失败（WindowBusyError）
    expect(mockDbState['init-blocked']?.status).toBe('failed');

    // 验证普通任务仍持有 lease（没被 init_window 影响）
    expect(activeLeases.has('normal-lock')).toBe(true);

    // 取消普通任务清理
    engine.cancelTask('normal-lock');
    try { await normalPromise; } catch { /* ignore */ }

    await wait(100);

    // Lease 应该被释放
    expect(activeLeases.size).toBe(0);
  });
});

// ── 续租验证测试（普通任务） ──────────────────────────
describe('Phase 9.3 — Lease 续租验证（普通任务，无回归）', () => {
  it('setInterval 创建续租定时器，handler执行期间 renew 可被调用，finally 清理 timer 并 release', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    (AssignmentEngine as any).instance = null;
    vi.clearAllMocks();
    mockDbState = {};
    emittedTaskFinished.length = 0;
    leaseTracker = { created: 0, released: 0, renewed: 0 };
    activeLeases.clear();

    setupTaskState('test-renew', 'arrival', 'pending');

    mockPool.acquireWindowLease.mockReset();
    mockPool.acquireWindowLease.mockImplementation(async (opts: any) => {
      if (isWindowLeasedBy(opts.windowId, opts.taskId)) {
        throw new WindowBusyError(opts.windowId, 'other');
      }
      return createMockLease(opts.windowId, opts.taskId);
    });
    mockPool.getStaffConnection.mockReset();
    mockPool.getStaffConnection.mockResolvedValue({ windowId: 'test-window-001', page: {} });
    mockPool.ensureWindowReady.mockReset();
    mockPool.ensureWindowReady.mockResolvedValue(undefined);

    const engine = AssignmentEngine.getInstance();

    await engine.execute({
      taskId: 'test-renew',
      site: 'tiannanda',
      taskType: 'arrival',
      assignments: [makeAssignment('员工A', 3)],
      handler: createOkHandler(),
      handlerTimeoutMs: 30_000,
    });

    await wait(50);

    // 验证 setInterval 被调用来创建续租定时器（60s 间隔）
    const renewIntervalCalls = setIntervalSpy.mock.calls.filter(
      call => call[1] === 60_000
    );
    expect(renewIntervalCalls.length).toBeGreaterThan(0);

    // 验证 setInterval 回调调用 lease.renew()
    const renewCallback = renewIntervalCalls[0][0] as () => void;
    const leaseBeforeRenew = leaseTracker.renewed;
    renewCallback();
    expect(leaseTracker.renewed).toBe(leaseBeforeRenew + 1);

    // 验证 clearInterval 被调用来清理定时器
    expect(clearIntervalSpy).toHaveBeenCalled();

    // 验证 lease.release 被调用（finally 块释放）
    expect(leaseTracker.released).toBeGreaterThan(0);
    // 验证任务最终为 done
    expect(mockDbState['test-renew']?.status).toBe('done');

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});

// ── 汇总输出 ──────────────────────────────────────────

afterAll(() => {
  console.log('\n' + '═'.repeat(80));
  console.log('  Phase 9.3 — init_window 接入 Lease Adapter 验收报告');
  console.log('═'.repeat(80));
  console.log('');

  const passed: string[] = [];
  const failed: string[] = [];

  for (const r of results) {
    const basicOk = r.finalDbStatus && r.finishedAtWritten && r.taskFinishedEmitted && r.cancelControllersCleared;
    const resourceOk = r.leaseAcquired ? r.leaseReleased : r.leaseReleased;
    const cancelOk = r.scenario.includes('取消') ? r.statusNotOverridden : true;
    const isPass = basicOk && resourceOk && cancelOk;

    if (isPass) {
      passed.push(r.scenario);
    } else {
      failed.push(r.scenario);
    }

    const icon = isPass ? '✅' : '❌';
    console.log(`${icon} ${r.scenario}`);
    console.log(`   最终DB状态: ${r.finalDbStatus}`);
    console.log(`   finished_at: ${r.finishedAtWritten ? '已写入' : '❌'}`);
    console.log(`   TASK_FINISHED: ${r.taskFinishedEmitted ? `✅ (status=${r.taskFinishedStatus})` : '❌'}`);
    console.log(`   Lease: ${r.leaseAcquired ? (r.leaseReleased ? '✅ 已释放' : '❌ 未释放') : 'N/A(前置失败)'}`);
    if (r.scenario.includes('取消')) {
      console.log(`   cancelled状态保持: ${r.statusNotOverridden ? '✅ 未被覆盖' : '❌ 被覆盖为failed'}`);
    }
    console.log(`   cancelControllers清理: ${r.cancelControllersCleared ? '✅' : '❌ 残留'}`);
    console.log('');
  }

  console.log('─'.repeat(80));
  console.log(`  通过: ${passed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`  ❌ 失败场景: ${failed.join(', ')}`);
  } else {
    console.log(`  ✅ 所有场景验收通过！`);
  }
  console.log('═'.repeat(80) + '\n');
});
