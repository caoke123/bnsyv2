# 系统架构

## 当前架构（过渡期：Admin 冻结中）

```
┌─────────────────────────────────────────────────────────────┐
│                      BrowserPool                            │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Worker    │  │   Worker    │  │   Worker    │        │
│  │ 天南大-肖飞 │  │ 天南大-刘磊 │  │ 天南大-孟德海│        │
│  │ staffName=  │  │ staffName=  │  │ staffName=  │        │
│  │   肖飞      │  │   刘磊      │  │   孟德海    │        │
│  │ 有凭据      │  │ 有凭据      │  │ 有凭据      │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          ↓                                 │
│              getStaffConnection(staffName)                 │
│              getStaffPage(staffName)                       │
│                                                             │
│  [冻结] getAdminConnection / getAdminPage (@deprecated)    │
└─────────────────────────────────────────────────────────────┘
```

## 目标架构（Worker Pool）

```
┌─────────────────────────────────────────────────────────────┐
│                      BrowserPool                            │
│                   (Worker Pool 统一模型)                    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Worker    │  │   Worker    │  │   Worker    │        │
│  │ 天南大-肖飞 │  │ 天南大-刘磊 │  │ 天南大-孟德海│        │
│  │ staffName=  │  │ staffName=  │  │ staffName=  │        │
│  │   肖飞      │  │   刘磊      │  │   孟德海    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          ↓                                 │
│              getConnection(staffName)                      │
│              getConnectionByWindowId(windowId)             │
└─────────────────────────────────────────────────────────────┘
         │                │                │
         ↓                ↓                ↓
    Arrival         Integrated        Dispatch
  (assignments)    (assignments)     (assignments)
```

## 核心组件集成

```
BrowserPool (Worker Pool)
    │
    ├── WindowLockManager
    │   └── 锁粒度: windowId（与 role 无关）
    │
    ├── TaskLogManager
    │   └── 日志上下文: { staffName, windowId }（与 role 无关）
    │
    ├── SessionManager
    │   └── 自动恢复: 所有 Worker 都有凭据，全覆盖
    │
    └── BrowserConnection (WorkerConnection)
        └── { page, browser, windowId, staffName, site }
```

## 退役路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase B-3B | Worker Pool 架构设计 | ✅ 完成 |
| Phase B-3C | Admin 依赖冻结（@deprecated） | ✅ 进行中 |
| Phase C-1 | Arrival 迁移到 Worker Window | 待执行 |
| Phase C-2 | 删除 getAdminPage / getAdminConnection | 待执行 |
| Phase C-3 | 删除 role 字段 | 待执行 |
