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
├── index.html            # 全部 HTML/CSS/JS 内联，零依赖零构建
├── manifest.webmanifest   # display: fullscreen，横竖屏均可
├── icon.png               # 主屏幕图标 (512×512)
└── docs/superpowers/...   # 设计文档与计划
```

单文件 vanilla JS，无框架。逻辑上分三个模块（同文件内以函数/对象划分）：

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

- 番茄钟状态机拆为纯函数（输入事件 → 新状态），页面内联同时
  可被 node 直接跑的最小断言脚本覆盖（`tests/pomodoro.test.mjs`）
- 视觉与常亮行为：Mac Chrome 手动验证 + iPad Safari 实测

## 部署

- GitHub 私有仓库？→ Pages 需公开仓库（免费版），代码无隐私，用公开仓库
- `gh` CLI 当前未登录，部署前用户需运行 `gh auth login`
- 主分支根目录直接作为 Pages 源，push 即更新
