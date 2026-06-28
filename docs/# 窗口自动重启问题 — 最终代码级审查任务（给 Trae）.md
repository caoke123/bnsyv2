# 窗口自动重启问题 — 最终代码级审查任务（给 Trae）

## 当前阶段说明

本次不是直接修复。

而是：

# 让 Trae 基于真实代码做最终代码级审查

目标：

```text id="dhc8rq"
确认：
问题根因
修复方向
架构影响
潜在副作用
最终Patch方案
```

在确认之前：

# 不允许直接修改代码。

---

# 一、当前问题现象（已确认）

## 用户操作

用户在 EasyBR 中：

```text id="1yn5wq"
直接点击 Chrome 浏览器窗口右上角 X
```

关闭：

```text id="saz8xt"
天南大-孟德海
```

---

## 实际结果

约：

```text id="sv9r3g"
5 秒后
```

窗口自动重新启动。

---

## 预期结果

用户关闭后：

```text id="a8zjlwm"
窗口应稳定保持关闭
```

除非：

```text id="1jlwmq"
用户主动点击“启动”
```

---

# 二、当前已确认的真实调用链（代码级）

## 用户关闭窗口

↓

## CDP disconnected

来源：

```ts id="ojdg9u"
registerDisconnectHandler()
```

↓

## cleanupDeadConnection()

文件：

```text id="31r4js"
BrowserPool.ts
```

当前行为：

```ts id="j8t02v"
delete retryCooldowns
delete failureCounts
```

但：

```ts id="wjlwm8"
没有 manuallyClosed
```

↓

## refreshConnectionStatus()

Step2：

```text id="wh0b2j"
发现 openedList 中仍存在窗口
```

↓

## connectAndSetupWindow()

↓

## doConnectAndSetup()

当前：

```ts id="mjlwm1"
无条件调用 openBrowerWithRetry()
```

↓

## EasyBR

```text id="uw5jlwm"
重新启动浏览器窗口
```

---

# 三、当前已经确认的结论

## 已排除

以下不是根因：

| 模块                    | 结论  |
| --------------------- | --- |
| 前端重复 init_window      | 已排除 |
| AssignmentEngine 自动恢复 | 已排除 |
| init_window 任务残留      | 已排除 |
| reconnect 自动恢复机制      | 已排除 |
| WindowLockManager     | 无关  |

---

# 已确认真正根因

## 根因1

# refreshConnectionStatus() 职责语义错误

当前：

```text id="3jlwmw"
发现窗口
→ 启动窗口
```

这是错误设计。

---

## 根因2

# cleanupDeadConnection() 清理策略错误

当前：

```ts id="w1jlwm"
cleanup 时：
delete retryCooldowns
delete failureCounts
```

导致：

```text id="gjlwm0"
指数退避保护完全失效
```

窗口断开后：

```text id="jlwmq3"
立即允许 reconnect/open
```

---

## 根因3

# connectAndSetupWindow() 语义污染

当前：

```text id="njlwm7"
connect
=
open + connect
```

没有区分：

| 行为     | 语义             |
| ------ | -------------- |
| 连接已有窗口 | connect only   |
| 主动启动窗口 | open + connect |

---

# 四、当前最重要的架构问题（重点）

## 当前系统缺少：

# Desired State（目标状态）

系统现在只有：

| 状态              | 含义      |
| --------------- | ------- |
| runtimeState    | 当前运行状态  |
| connectionState | CDP连接状态 |
| busyState       | 是否执行任务  |

但：

# 没有：

```text id="jlwmk9"
用户期望窗口：
应该打开？
还是应该关闭？
```

---

# 结果

系统无法区分：

| 场景       |
| -------- |
| 用户主动关闭   |
| 浏览器崩溃    |
| 网络断开     |
| EasyBR异常 |
| CDP掉线    |

所有情况：

```text id="jlwm2m"
都被当成“需要恢复”
```

---

# 五、当前阶段：需要 Trae 做的事情（重点）

## 不是直接修复

而是：

# 基于真实代码做最终审查

确认：

```text id="jlwm5h"
修复方案是否正确
是否存在隐式依赖
是否会引发新的状态漂移
```

---

# 六、请重点审查以下修复方案

---

# 修复方案 A（P0）

## cleanupDeadConnection 不再删除 cooldown/failureCount

---

## 当前代码（问题）

文件：

```text id="jlwm8d"
BrowserPool.ts
```

当前逻辑：

```ts id="jlwm4t"
retryCooldowns.delete(windowId)
failureCounts.delete(windowId)
```

---

## 建议方案

改为：

```text id="jlwm0k"
设置 disconnect cooldown
```

例如：

```ts id="jjlwm7"
cooldownUntil = now + 60s
```

---

# 请 Trae 审查：

## 1.

是否：

```text id="jlwm0u"
存在其他逻辑依赖：
cleanup 后必须清空 cooldown
```

---

## 2.

disconnect cooldown：

```text id="jlwmq7"
60秒
```

是否合理。

---

## 3.

是否会影响：

```text id="jlwm2x"
真实崩溃后的自动恢复能力
```

---

## 4.

是否：

```text id="jlwm0v"
应该新增：
disconnectCooldowns
```

而不是复用：

```text id="jlwm5m"
retryCooldowns
```

---

# 修复方案 B（P0 核心）

## 拆分 connect 与 open

---

# 当前问题

当前：

```ts id="jlwm9w"
connectAndSetupWindow()
```

内部：

```text id="jlwm3w"
永远 openBrowser
```

这是语义错误。

---

# 建议方向

拆分为：

---

## A

```ts id="jlwm5n"
connectExistingWindow()
```

语义：

```text id="jlwm6x"
只连接已有窗口
不启动浏览器
```

---

## B

```ts id="jlwm9m"
openAndConnectWindow()
```

语义：

```text id="jlwm4q"
主动启动窗口
再建立连接
```

---

# 请 Trae 审查：

## 1.

哪些调用方：

```text id="jlwm6m"
应该 connect only
```

---

## 2.

哪些调用方：

```text id="jlwm9u"
应该 open + connect
```

---

## 3.

是否存在：

```text id="jlwm0n"
隐式依赖：
connectAndSetupWindow 一定会 open
```

---

## 4.

refreshConnectionStatus()

是否：

```text id="jlwm1q"
应该彻底禁止 openBrowser
```

---

# 修复方案 C（P1）

## 引入 Desired State（长期方向）

---

# 当前问题

系统不知道：

```text id="jlwm7l"
用户想让窗口保持打开
还是保持关闭
```

---

# 建议方向

新增：

```ts id="jlwm3e"
desiredWindowStates
```

例如：

```ts id="jlwm4e"
OPEN
CLOSED
```

---

# 然后：

## refreshConnectionStatus()

只负责：

```text id="jlwm9e"
让实际状态趋近 desiredState
```

---

# 请 Trae 审查：

## 1.

是否：

```text id="jlwm2v"
当前 runtimeStates 已足够承载 desiredState
```

还是：

```text id="jlwm8q"
应单独维护
```

---

## 2.

desiredState：

是否应该：

```text id="jlwm1m"
持久化
```

还是：

```text id="jlwm5e"
仅内存态
```

---

## 3.

toggleWindow()

是否：

```text id="jlwm7n"
应修改 desiredState
```

---

## 4.

refreshConnectionStatus()

是否：

```text id="jlwm2s"
必须以 desiredState 为最高优先级
```

---

# 修复方案 D（P2）

## GET API 去副作用

---

# 当前问题

当前：

```text id="jlwm6y"
GET /status
```

内部可能：

```text id="jlwm0s"
触发 refreshConnectionStatus()
```

进而：

```text id="jlwm9r"
启动窗口
修改状态
触发 reconnect
```

---

# 这是严重职责污染

GET API：

# 必须纯读取。

---

# 请 Trae 审查：

## 1.

哪些 GET API：

```text id="jlwm3x"
存在 refresh 副作用
```

---

## 2.

哪些地方：

```text id="jlwm4x"
依赖“GET 自动 refresh”
```

---

## 3.

是否：

```text id="jlwm5x"
后台定时巡检
```

已经足够替代 GET refresh。

---

# 修复方案 E（P2）

## 前端增加“关闭窗口”入口

---

# 当前问题

用户只能：

```text id="jlwm8r"
点 EasyBR 的 X
```

系统无法知道：

```text id="jlwm2n"
这是用户主动关闭
```

---

# 建议方向

前端：

新增：

```text id="jlwm4v"
关闭窗口按钮
```

调用：

```ts id="jlwm7x"
toggleWindow(close)
```

确保：

```text id="jlwm0y"
manuallyClosed
```

正确写入。

---

# 请 Trae 审查：

## 1.

当前 UI：

是否已有：

```text id="jlwm6s"
关闭窗口入口
```

---

## 2.

如果新增：

是否：

```text id="jlwm9x"
会与 EasyBR 的真实窗口状态冲突
```

---

## 3.

是否需要：

```text id="jlwm1y"
同步 EasyBR 实际状态
```

---

# 七、本次最终审查必须输出的内容

Trae 必须输出：

---

# 1. 修复方案最终评估

格式：

| 修复项 | 是否推荐 | 风险 | 副作用 | 建议优先级 |
| --- | ---- | -- | --- | ----- |

---

# 2. 最终 Patch Plan

必须明确：

| 文件 | 函数 | 修改点 |
| -- | -- | --- |

---

# 3. 隐式依赖风险

重点确认：

```text id="jlwm5v"
哪些旧逻辑依赖：
connectAndSetupWindow 一定会 open
```

---

# 4. 是否存在状态漂移风险

例如：

```text id="jlwm9v"
desiredState
runtimeState
manuallyClosed
cooldown
```

之间是否可能再次产生：

```text id="jlwm4r"
状态竞争
```

---

# 5. 最终推荐实施顺序

要求：

```text id="jlwm7v"
渐进式修复
```

不能：

```text id="jlwm1v"
一次性大改
```

---

# 八、当前阶段最重要目标

当前目标不是：

```text id="jlwm3v"
继续扩展功能
```

而是：

# 让窗口生命周期“行为确定”

即：

---

# 用户关闭

系统：

```text id="jlwm8v"
稳定保持关闭
```

---

# 用户启动

系统：

```text id="jlwm2r"
稳定启动
```

---

# 巡检系统

只能：

```text id="jlwm5r"
恢复连接
```

不能：

```text id="jlwm9q"
偷偷启动窗口
```

---

# 当前整个状态系统最重要的问题：

# 不是状态显示。

而是：

# “系统到底有没有权力自动启动窗口”

这个边界必须明确。
