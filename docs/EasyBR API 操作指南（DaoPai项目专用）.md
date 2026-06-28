# EasyBR API 操作指南（DaoPai项目专用）

版本：2026-06

适用项目：

* DaoPai
* bnsy-operator
* Playwright自动化执行器

官方文档：

https://www.ebrower.com/helperdoc/apidoc.html

---

# 一、架构理解

EasyBR 本质上是：

```text
EasyBR
    ↓
本地API
    ↓
打开浏览器窗口
    ↓
返回CDP调试端口
    ↓
Playwright接管
    ↓
执行自动化
```

对于 DaoPai 项目：

```text
DaoPai
    ↓
任务创建
    ↓
bnsy-operator
    ↓
EasyBR API
    ↓
打开指定窗口
    ↓
Playwright连接
    ↓
执行到件扫描
```

---

# 二、API服务状态

默认地址：

```text
http://127.0.0.1:3001
```

说明：

EasyBR启动后会自动启动本地API服务。

---

## 检查API是否可用

GET

```http
http://127.0.0.1:3001/auto/status
```

返回：

```json
{
  "code": 0,
  "msg": "success"
}
```

判断标准：

```text
code == 0
```

表示API正常。

---

# 三、获取浏览器列表

GET

```http
http://127.0.0.1:3001/auto/getBrowerList?page=1&limit=100
```

返回：

```json
{
  "code": 0,
  "data": [
    {
      "browerid": "67dfaaf4390fea598af4180d",
      "browername": "天南大-刘磊"
    }
  ]
}
```

关键字段：

```text
browerid
```

后续所有操作都依赖这个ID。

---

# 四、打开浏览器窗口

POST

```http
http://127.0.0.1:3001/auto/openBrower
```

请求：

```json
{
  "browerid": "67dfaaf4390fea598af4180d"
}
```

返回：

```json
{
  "code": 0,
  "data": {
    "ws": "ws://localhost:51760/devtools/browser/xxxx",
    "http": "http://localhost:51760",
    "session": "xxxx"
  }
}
```

重点：

```text
ws
```

Playwright直接连接。

---

# 五、Playwright接管浏览器

推荐方式：

```ts
import { chromium } from 'playwright'

const browser =
  await chromium.connectOverCDP(ws)

const context =
  browser.contexts()[0]

const page =
  context.pages()[0]
```

ws来自：

```text
openBrower返回值
```

---

# 六、关闭浏览器窗口

POST

```http
http://127.0.0.1:3001/auto/closeBrower
```

请求：

```json
{
  "browerid": "67dfaaf4390fea598af4180d"
}
```

返回：

```json
{
  "code": 0,
  "msg": "success"
}
```

---

# 七、获取已打开窗口

GET

```http
http://127.0.0.1:3001/auto/openedList
```

返回：

```json
{
  "code": 0,
  "data": [
    {
      "browerid": "...",
      "browername": "天南大-刘磊",
      "isopen": true
    }
  ]
}
```

用途：

```text
窗口状态同步
```

用于：

```text
任务中心
连接状态
窗口监控
```

---

# 八、DaoPai推荐实现方案

不要：

```text
扫描CDP端口
netstat
端口猜测
```

稳定性差。

---

推荐：

## 方案A

启动时同步窗口列表

```text
getBrowerList
```

缓存：

```text
browerid
browername
```

---

## 方案B

执行任务时

调用：

```text
openBrower
```

获取：

```text
ws
```

---

## 方案C

Playwright连接：

```text
connectOverCDP(ws)
```

---

## 方案D

执行自动化

例如：

```text
到件扫描

派件扫描

签收录入
```

---

## 方案E

完成后保持窗口

不要自动关闭。

方便人工查看。

---

# 九、DaoPai推荐窗口命名

统一格式：

```text
天南大-刘磊

天南大-孟德海

天南大-管理员
```

不要：

```text
window1

test

账号01
```

---

# 十、推荐状态检测

不要使用：

```ts
browser.version()
```

判断窗口是否存活。

已经验证：

```text
EasyBR窗口关闭后

browser.version()

仍可能返回成功
```

---

推荐：

```ts
await page.evaluate(() => 1 + 1)
```

或者：

```ts
await page.title()
```

判断连接是否真实存在。

失败：

```text
is_connected = false
```

---

# 十一、DaoPai执行链路

```text
任务中心

↓

选择窗口

↓

openBrower

↓

获取ws

↓

Playwright接管

↓

Dashboard

↓

关闭弹窗

↓

ArrivalscanBatch

↓

关闭弹窗

↓

输入运单

↓

提交

↓

获取Toast

↓

记录结果

↓

返回任务中心
```

---

# 十二、当前项目最佳实践

推荐：

```text
Dashboard

↓

关闭弹窗

↓

直接进入

/scanning/ArrivalscanBatch

↓

关闭弹窗

↓

开始执行
```

不要再通过：

```text
侧边菜单

操作中心

到件扫描（批量）
```

进行导航。

原因：

```text
菜单收缩

Element动画

DOM变化

都会导致自动化失败
```

直接URL进入最稳定。
               