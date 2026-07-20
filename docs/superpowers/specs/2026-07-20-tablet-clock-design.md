# iPad 桌面时钟（单文件 PWA）设计文档

日期：2026-07-20
状态：已与用户确认

## 目标

做一个放在书桌上的 iPad 全屏时钟，视觉效果类似 iOS 锁屏时钟。
真正的系统锁屏第三方无法修改，因此实现为"全屏网页 + 添加到主屏幕 + 屏幕常亮"。

## 需求（用户已确认）

- 目标设备：iPad（Safari / 主屏幕 PWA）
- 使用场景：书桌/工作台，白天为主
- 显示内容：时 + 分 + 秒（24 小时制）、日期 + 星期（中文，如"7月20日 星期日"）
- 附加功能：番茄钟（固定 25 分钟倒计时）
- 视觉风格：极简大字数字钟，深色底白字，单一主题
- 部署：GitHub Pages（免费 HTTPS，iPad 免登录访问）

## 明确不做（YAGNI）

- 多主题 / 设置面板（番茄钟时长为代码内常量）
- 天气、日程等外部数据（零网络依赖，断网照常工作）
- 闹钟、整点报时
- 原生 app 封装

## 架构

```
tablet-clock/
├── index.html             # 页面结构 + 样式 + DOM 胶水代码（内联）
├── logic.js               # 纯逻辑 ES module：时间格式化 + 番茄钟状态机（无 DOM）
├── manifest.webmanifest   # display: fullscreen，横竖屏均可
├── icon.png               # 主屏幕图标 (512×512)
├── tests/logic.test.mjs   # node --test 直接跑，零测试框架依赖
└── docs/superpowers/...   # 设计文档与计划
```

vanilla JS，无框架。纯逻辑拆到 `logic.js` 使其可被 node 直接测试，
页面通过 `<script type="module">` 引入。逻辑上分三个模块：

1. **clock**：每 250ms 读系统时间（`new Date()`），更新时间与日期 DOM。
   秒变化才写 DOM，避免无效重绘。
2. **pomodoro**：状态机 `idle → running → paused → done`。
   - 角落 ▶ 按钮点击：idle→running（主区域切换为 25:00 倒计时）
   - 倒计时区域单击：running⇄paused
   - 双击：重置回 idle（恢复时钟显示）
   - done：全屏闪烁 + 提示音，任意点击回 idle
   - 计时基准用目标时间戳（`endTime - now`），而非累计 setInterval，
     防止后台节流导致计时漂移
3. **display/keep-awake**：
   - Screen Wake Lock API 请求常亮；`visibilitychange` 时重新请求；
     失败静默降级（角落显示小图标提示）
   - 防烧屏：整个内容容器每分钟随机平移 ±8px（transform）
   - 提示音：iOS Safari 需用户交互后才能出声，在用户点击 ▶ 时
     初始化/解锁 AudioContext

## 关键 iOS 适配

- `<meta name="apple-mobile-web-app-capable">` + manifest，
  "添加到主屏幕"后无浏览器边框全屏
- Wake Lock 需要 HTTPS（GitHub Pages 满足）；
  兜底方案写入 README：设置 → 显示与亮度 → 自动锁定 → 永不
- 字号用 `vw/vh` + `clamp()` 自适应横竖屏；等宽数字
  （`font-variant-numeric: tabular-nums`）防止秒跳动时数字晃动

## 错误处理

- Wake Lock 不支持/被拒：静默降级 + 角落图标
- 音频播放失败：忽略（闪烁仍在）
- 无网络：不影响任何功能

## 测试与验证

- 番茄钟状态机与时间格式化为纯函数（输入事件 → 新状态），
  由 `tests/logic.test.mjs` 覆盖（node 内置 test runner，零框架依赖）
- 视觉与常亮行为：Mac Chrome 手动验证 + iPad Safari 实测

## 部署

- GitHub 私有仓库？→ Pages 需公开仓库（免费版），代码无隐私，用公开仓库
- `gh` CLI 当前未登录，部署前用户需运行 `gh auth login`
- 主分支根目录直接作为 Pages 源，push 即更新

## 迭代记录 2026-07-21

**iPad 触控 bug（已修复）**：iOS Safari 的双击缩放判定会吞掉快速连点的
click；且 iOS 不触发 dblclick 事件。修复：`touch-action: manipulation` +
自实现 350ms 点按计数（1 次=暂停/继续，≥2 次=重置）+ ▶ 按钮加大并抬离
底部系统手势区。调试教训：后台标签页 rAF 节流为零，会伪装成"代码崩溃"。

**心流版重设计**：目标"感觉时间在流逝、极简却极致"。
- 秒不用数字：一条发丝线每分钟从左到右连续填满（rAF 亚秒级平滑）
- 超细字重 HH:MM，冒号 2s 呼吸；日期宽字距
- 背景色相随一天时刻漂移（深夜靛蓝→白昼青蓝→黄昏紫粉→琥珀→入夜）
- 呼吸柔光 7s 一息；番茄钟改为极细圆环 + 柔和琥珀呼吸提醒
- 逻辑心跳 setInterval(1s) 兜底：页面被遮挡时状态机照常推进到"时间到"

## 迭代记录 2026-07-21b（阴阳版 + 触控治本）

- 触控治本：交互从 click 降级到 pointerup 主路径（WebKit 触摸仿真实测
  4 次触摸仅合成 1 个 click，pointerup 4/4 全达），click 仅作键盘/老设备保底
- 阴阳主题：昼(阳)纸白底墨字 ⇄ 夜(阴)靛蓝底光字，黎明/黄昏 30s 粒度连续过渡；
  冒号=上实下虚阴阳双点随呼吸消长；秒线两仪，"太极眼"游走于明暗交界
- ?debug 诊断面板；window.__forceHour(h) 可预览任意时刻主题
