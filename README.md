# 马步问题 · 两页交互演绎

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | **第一页**：单马。可任意指定起点与目标格（小棋盘点选，默认 a1 → h8）。含距离热力图、最短路径动画、骑士巡游动画（闭合 / 开放）。 |
| `two-knights.html` | **第二页**：两匹马（默认 a1 与 h8）。三种“互保”定义的最优解、两马同时行进的动画、候选终局排行榜。 |
| `knight-core.js` | 两页共用的算法内核：BFS 最短路、路径回溯、Warnsdorff 巡游、闭合巡游搜索、互保分析、小棋盘选择器。 |
| `common.css` | 两页共用的样式。 |
| `_verify/` | 离线验证脚本（Node），见下。 |

直接双击 `index.html` 打开即可，纯静态、无外部依赖（只需 `knight-core.js` 与 `common.css` 在同一目录）。
两页都已适配移动端（360/390/414/768px 实测无横向溢出）。

Made By **deepseek-flash**（DeepSeek Harness 智能体）—— 见两页页脚。

## 移动端适配

- 棋盘格边长用 CSS 变量按视口缩放：`--cell: calc((100vw - 64px) / 8)`（≤400px 时改为 `- 50px`），
  保证 8 列棋盘在任何宽度下都不横向溢出；桌面仍是 56px。
- `.board` 用 `box-sizing: content-box`，因此 JS 里 `cell.offsetLeft/Top` 仍与棋盘内容坐标系一致，棋子定位不用改。
- 窄屏下棋盘与侧栏改上下堆叠；按钮保持两列、高度 ≥42px（拇指可点）；选择器缩到 18px 仍可点选；
  自校验表格缩小字号；排行榜在极窄屏可容器内横向滚动，并带右侧渐隐提示。
- 实测（代码见 `_verify/cdp-measure.mjs`，用 CDP 真机视口模拟）：

| 视口 | 棋盘 | 格边长 | 按钮 | 横向溢出 |
|---|---|---|---|---|
| 320px | 276px | 33.8px | 单列 42px 高 | 无 |
| 360px | 316px | 38.8px | 两列 42px 高 | 无 |
| 390px | 346px | 42.5px | 两列 42px 高 | 无 |
| 414px | 356px | 43.8px | 两列 42px 高 | 无 |
| 768px | 454px | 56px | 桌面布局 | 无 |

## 离线与无头验证

```bash
node _verify/core-test.mjs        # 三种互保定义的结果与自校验
node _verify/all-starts.mjs       # 全部 64 个起点的巡游都存在且合法
node _verify/eccentricity.mjs     # 离心率分布与对称轨道
node _verify/final-check.mjs      # 第一页数学结论的独立复核
node _verify/make-probe.mjs index.html        # 生成注入 onerror + 布局检测 + 冒烟测试的副本
node _verify/make-probe.mjs two-knights.html
node _verify/cdp-measure.mjs index.html 390 844      # CDP 真机视口下量布局
node _verify/cdp-shot.mjs two-knights.html 390 844 mobile-p2.png   # CDP 真机视口整页截图
```

`make-probe.mjs` 生成的 `*.probe.html` 会注入 `window.onerror` 捕获器、布局溢出检测和
自动点击全部控件的冒烟测试，结果写在 `<pre id="smoke-log">` / `<pre id="layout-log">` 里：

```powershell
chrome --headless=new --disable-gpu --virtual-time-budget=9000 --dump-dom file:///.../index.probe.html
```

两页当前均为 `JSERR=0 / SMOKE_ERRORS=0`（共 25 项交互）。

> 注意：无头 Chrome 的窗口最小宽度是 485px，`--window-size` 与 `<meta name="viewport">`
> 都无法把布局视口压到手机宽度，所以手机尺寸必须用 CDP 的 `Emulation.setDeviceMetricsOverride`
> （即 `cdp-measure.mjs` / `cdp-shot.mjs`，只用 Node 内置模块实现的极简 CDP 客户端）。

## 结论

**第一页（单马）**
- 从 a1 出发，最难到达的是对角角落 **h8，需要 6 步**（a1→c2→e1→g2→h4→g6→h8）；d5、e4 这类中心格只要 3 步。
- 步数分布 0:1、1:2、2:9、3:20、4:21、5:10、6:1，共 64 格，全部可达。
- 对任意起点：**全盘 64 格都能在 6 步内跳到**；只有从四个角落出发才会用满 6 步，
  24 格最“居中”（4 步），其余 36 格为 5 步。
- 若“跳遍”指走遍整盘（骑士巡游）：**63 步**，且 8×8 棋盘上存在闭合巡游（第 64 跳回到起点）。

**第二页（两匹马 a1 / h8，“互保”的三种定义）**

| 定义 | 最少总步数 | 回合数 | 一个最优终局 |
|---|---|---|---|
| A 两马互相攻击 | **5 步** | 3 | a3 与 b5 |
| B 共同保护同一空点 | **4 步** | 2 | d2 与 d6（同保 e4、c4） |
| C 一马守在另一马能攻击的点上 | **5 步** | 3 | d4 被 b5 保护 |

“总步数”= 两马各自步数之和；“回合数”= 两者较大者（两马同一回合内各走一步）。

