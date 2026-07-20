# iPad 桌面时钟（单页 PWA）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 iPad 全屏桌面时钟网页（大字数字钟 + 日期星期 + 25 分钟番茄钟），部署到 GitHub Pages，添加到 iPad 主屏幕后全屏常亮运行。

**Architecture:** 纯逻辑（时间格式化 + 番茄钟状态机）放在 `logic.js`（ES module，无 DOM 依赖），由 node 内置 test runner 测试；`index.html` 内联全部样式和 DOM 胶水代码，通过 `<script type="module">` 引入 logic.js。零框架、零构建、零运行时依赖。

**Tech Stack:** vanilla JS (ES modules)、node v23 内置 `node --test`（仅测试）、Python PIL（仅生成图标）、GitHub Pages（托管）。

## Global Constraints

- 工作目录：`/Users/chenbio/tablet-clock/`（已 git init，main 分支）
- 零运行时依赖：不引入任何 npm 包、CDN 脚本、外部字体、网络请求
- 番茄钟时长为常量 `POMODORO_MS = 25 * 60 * 1000`，不做设置界面
- 深色主题唯一：背景 `#000`，主文字 `#e8e8ec`，次要文字 `#9a9aa2`，番茄钟强调色 `#ff9f0a`
- 所有页面文案为中文
- 时间一律 24 小时制；显示用等宽数字（`font-variant-numeric: tabular-nums`）
- 提交信息用 conventional commits（feat:/docs:/chore:），每个 Task 至少一次提交

---

### Task 1: 纯逻辑模块 logic.js（TDD）

**Files:**
- Create: `logic.js`
- Test: `tests/logic.test.mjs`

**Interfaces:**
- Produces（后续 Task 依赖的确切签名）:
  - `POMODORO_MS: number` — 1500000
  - `formatTime(date: Date): string` — `"04:05:06"` 补零 24 小时制
  - `formatDateLine(date: Date): string` — `"7月20日 星期一"`
  - `createIdle(): {phase:'idle'}`
  - `transition(state, event: 'toggle'|'reset'|'tick', now: number): state` — 状态对象为 `{phase:'idle'} | {phase:'running', endTime} | {phase:'paused', remainingMs} | {phase:'done'}`，纯函数不修改入参
  - `remainingMs(state, now: number): number|null` — idle 返回 null
  - `formatCountdown(ms: number): string` — `"25:00"`，秒向上取整

- [ ] **Step 1: 写失败的测试**

创建 `tests/logic.test.mjs`：

```js
// node --test 直接运行，无任何测试框架依赖
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POMODORO_MS, formatTime, formatDateLine,
  createIdle, transition, remainingMs, formatCountdown,
} from '../logic.js';

test('formatTime 补零、24 小时制', () => {
  assert.equal(formatTime(new Date(2026, 6, 20, 4, 5, 6)), '04:05:06');
  assert.equal(formatTime(new Date(2026, 6, 20, 23, 59, 0)), '23:59:00');
});

test('formatDateLine 中文日期+星期', () => {
  // 2026-07-20 实际是星期一（已用 date 命令核实）
  assert.equal(formatDateLine(new Date(2026, 6, 20)), '7月20日 星期一');
  assert.equal(formatDateLine(new Date(2026, 0, 4)), '1月4日 星期日');
});

test('番茄钟：idle → toggle → running，endTime = now + 25min', () => {
  const s = transition(createIdle(), 'toggle', 1000);
  assert.deepEqual(s, { phase: 'running', endTime: 1000 + POMODORO_MS });
});

test('番茄钟：running → toggle → paused，保留剩余时间', () => {
  const running = { phase: 'running', endTime: 1000 + POMODORO_MS };
  const s = transition(running, 'toggle', 61000);
  assert.deepEqual(s, { phase: 'paused', remainingMs: POMODORO_MS - 60000 });
});

test('番茄钟：paused → toggle → running，按剩余时间续跑', () => {
  const paused = { phase: 'paused', remainingMs: 90000 };
  const s = transition(paused, 'toggle', 500000);
  assert.deepEqual(s, { phase: 'running', endTime: 590000 });
});

test('番茄钟：running + tick 到点 → done；未到点不变', () => {
  const running = { phase: 'running', endTime: 2000 };
  assert.equal(transition(running, 'tick', 1999).phase, 'running');
  assert.equal(transition(running, 'tick', 2000).phase, 'done');
  assert.equal(transition(running, 'tick', 9999).phase, 'done');
});

test('番茄钟：done → toggle → idle（任意点击关闭提醒）', () => {
  assert.deepEqual(transition({ phase: 'done' }, 'toggle', 0), { phase: 'idle' });
});

test('番茄钟：任意状态 reset → idle', () => {
  for (const s of [createIdle(), { phase: 'running', endTime: 9 },
                   { phase: 'paused', remainingMs: 9 }, { phase: 'done' }]) {
    assert.deepEqual(transition(s, 'reset', 123), { phase: 'idle' });
  }
});

test('transition 是纯函数，不修改入参', () => {
  const running = { phase: 'running', endTime: 2000 };
  transition(running, 'toggle', 1000);
  transition(running, 'tick', 9999);
  assert.deepEqual(running, { phase: 'running', endTime: 2000 });
});

test('remainingMs 各状态取值', () => {
  assert.equal(remainingMs({ phase: 'running', endTime: 5000 }, 3000), 2000);
  assert.equal(remainingMs({ phase: 'running', endTime: 5000 }, 9000), 0); // 不出负数
  assert.equal(remainingMs({ phase: 'paused', remainingMs: 700 }, 0), 700);
  assert.equal(remainingMs({ phase: 'done' }, 0), 0);
  assert.equal(remainingMs(createIdle(), 0), null);
});

test('formatCountdown 秒向上取整', () => {
  assert.equal(formatCountdown(POMODORO_MS), '25:00');
  assert.equal(formatCountdown(1000), '00:01');
  assert.equal(formatCountdown(999), '00:01');   // 不足 1 秒显示 1 秒
  assert.equal(formatCountdown(59500), '01:00'); // 取整后进位
  assert.equal(formatCountdown(0), '00:00');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/chenbio/tablet-clock && node --test tests/`
Expected: FAIL — `Cannot find module '../logic.js'`

- [ ] **Step 3: 写最小实现**

创建 `logic.js`：

```js
// 纯逻辑模块：时间格式化 + 番茄钟状态机
// 无 DOM / 无副作用，页面与 node 测试共用

export const POMODORO_MS = 25 * 60 * 1000;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n) => String(n).padStart(2, '0');

export function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDateLine(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 星期${WEEKDAYS[date.getDay()]}`;
}

// ---- 番茄钟状态机 ----
// state: {phase:'idle'} | {phase:'running', endTime} | {phase:'paused', remainingMs} | {phase:'done'}
// event: 'toggle'(单击) | 'reset'(双击) | 'tick'(定时器)
// 计时基准是目标时间戳 endTime，而非累计 interval，后台节流不会导致漂移

export function createIdle() {
  return { phase: 'idle' };
}

export function transition(state, event, now) {
  switch (event) {
    case 'toggle':
      if (state.phase === 'idle') return { phase: 'running', endTime: now + POMODORO_MS };
      if (state.phase === 'running') return { phase: 'paused', remainingMs: Math.max(0, state.endTime - now) };
      if (state.phase === 'paused') return { phase: 'running', endTime: now + state.remainingMs };
      return createIdle(); // done → idle
    case 'reset':
      return createIdle();
    case 'tick':
      if (state.phase === 'running' && now >= state.endTime) return { phase: 'done' };
      return state;
    default:
      return state;
  }
}

export function remainingMs(state, now) {
  if (state.phase === 'running') return Math.max(0, state.endTime - now);
  if (state.phase === 'paused') return state.remainingMs;
  if (state.phase === 'done') return 0;
  return null;
}

export function formatCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  return `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/chenbio/tablet-clock && node --test tests/`
Expected: PASS — `# pass 11`，`# fail 0`

- [ ] **Step 5: Commit**

```bash
cd /Users/chenbio/tablet-clock
git add logic.js tests/logic.test.mjs
git commit -m "feat: 时间格式化与番茄钟状态机（纯逻辑 + 测试）"
```

---

### Task 2: index.html 时钟界面

**Files:**
- Create: `index.html`
- Create: `.gitignore`

**Interfaces:**
- Consumes: `logic.js` 的 `formatTime`, `formatDateLine`（Task 1 签名）
- Produces: DOM 结构供 Task 3 使用 —— `#stage`（内容容器）、`#time`（大字）、`#date`（副行）、`#pomo-btn`（番茄钟按钮，本 Task 仅占位隐藏）；全局函数暂无，Task 3 重写内联 script

- [ ] **Step 1: 写页面**

创建 `index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>时钟</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: #000;
    color: #e8e8ec;
    font-family: -apple-system, "SF Pro Display", "Helvetica Neue", "PingFang SC", sans-serif;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    -webkit-user-select: none; user-select: none;
  }
  #stage { text-align: center; transition: transform 2s ease; }
  #time {
    font-size: clamp(80px, 21vw, 40vh);
    font-weight: 200;
    line-height: 1;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }
  #date {
    font-size: clamp(20px, 3.5vw, 7vh);
    font-weight: 300;
    color: #9a9aa2;
    margin-top: 3vh;
  }
  #pomo-btn {
    position: fixed; right: 4vw; bottom: 4vh;
    width: 56px; height: 56px; border-radius: 50%;
    border: 1px solid #333; background: transparent; color: #9a9aa2;
    font-size: 22px; opacity: 0.5;
  }
  #pomo-btn[hidden] { display: none; }
</style>
</head>
<body>
  <div id="stage">
    <div id="time">--:--:--</div>
    <div id="date"></div>
  </div>
  <button id="pomo-btn" hidden aria-label="番茄钟">▶</button>

<script type="module">
import { formatTime, formatDateLine } from './logic.js';

const timeEl = document.getElementById('time');
const dateEl = document.getElementById('date');
const stage = document.getElementById('stage');

let lastTime = '', lastDate = '';
function render() {
  const now = new Date();
  const t = formatTime(now);
  const d = formatDateLine(now);
  if (t !== lastTime) { timeEl.textContent = t; lastTime = t; }   // 秒变才写 DOM
  if (d !== lastDate) { dateEl.textContent = d; lastDate = d; }
}
render();
setInterval(render, 250);

// 防烧屏：每分钟整体随机位移 ±8px
setInterval(() => {
  const dx = Math.round(Math.random() * 16 - 8);
  const dy = Math.round(Math.random() * 16 - 8);
  stage.style.transform = `translate(${dx}px, ${dy}px)`;
}, 60000);
</script>
</body>
</html>
```

创建 `.gitignore`：

```
.DS_Store
```

- [ ] **Step 2: 本地起服务，浏览器验证**

Run: `cd /Users/chenbio/tablet-clock && python3 -m http.server 8765 &`（后台）
浏览器打开 `http://localhost:8765/`（可用 claude-in-chrome 截图核对）。

验收标准：
1. 黑底白字大时钟居中，秒在走，无横向滚动条
2. 日期行显示"7月20日 星期一"样式的中文
3. 缩小窗口模拟竖屏，字号自适应不溢出
4. Console 无报错（模块加载成功）

- [ ] **Step 3: Commit**

```bash
cd /Users/chenbio/tablet-clock
git add index.html .gitignore
git commit -m "feat: 全屏时钟页面（大字时钟 + 日期星期 + 防烧屏位移）"
```

---

### Task 3: 番茄钟 UI 集成

**Files:**
- Modify: `index.html`（新增样式 + 重写内联 script）

**Interfaces:**
- Consumes: Task 1 全部导出；Task 2 的 DOM（`#stage` `#time` `#date` `#pomo-btn`）
- Produces: 完整交互页面；无对外接口

- [ ] **Step 1: 增加番茄钟样式**

在 `index.html` 的 `<style>` 末尾（`#pomo-btn[hidden]` 规则之后）追加：

```css
  body.mode-focus #time { color: #ff9f0a; }
  body.mode-paused #time { color: #9a9aa2; }
  body.mode-done { animation: flash 0.8s steps(2) infinite; }
  @keyframes flash {
    0%   { background: #000; }
    100% { background: #4d2f00; }
  }
```

- [ ] **Step 2: 重写内联 script 接入状态机**

将 `<script type="module">…</script>` 整体替换为：

```html
<script type="module">
import {
  formatTime, formatDateLine,
  createIdle, transition, remainingMs, formatCountdown,
} from './logic.js';

const timeEl = document.getElementById('time');
const dateEl = document.getElementById('date');
const stage = document.getElementById('stage');
const pomoBtn = document.getElementById('pomo-btn');

let pomo = createIdle();
let lastTime = '', lastDate = '';

// ---- 提示音：iOS 需用户交互后解锁 AudioContext，在点击 ▶ 时初始化 ----
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function beep() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain); gain.connect(audioCtx.destination);
    const t = t0 + i * 0.35;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.start(t); osc.stop(t + 0.3);
  }
}

function dispatch(event) {
  const prevPhase = pomo.phase;
  pomo = transition(pomo, event, Date.now());
  if (prevPhase === 'running' && pomo.phase === 'done') beep();
  render();
}

function render() {
  const now = new Date();
  let t, d;
  if (pomo.phase === 'idle') {
    t = formatTime(now); d = formatDateLine(now);
  } else if (pomo.phase === 'done') {
    t = '00:00'; d = '时间到！点击返回时钟';
  } else {
    t = formatCountdown(remainingMs(pomo, now.getTime()));
    d = pomo.phase === 'running' ? '专注中 · 单击暂停 · 双击重置'
                                 : '已暂停 · 单击继续 · 双击重置';
  }
  if (t !== lastTime) { timeEl.textContent = t; lastTime = t; }
  if (d !== lastDate) { dateEl.textContent = d; lastDate = d; }
  document.body.classList.toggle('mode-focus', pomo.phase === 'running');
  document.body.classList.toggle('mode-paused', pomo.phase === 'paused');
  document.body.classList.toggle('mode-done', pomo.phase === 'done');
  pomoBtn.hidden = pomo.phase !== 'idle';
}

function tick() {
  dispatch('tick'); // dispatch 内部处理 running→done 的蜂鸣
}
render();
pomoBtn.hidden = false;
setInterval(tick, 250);

// ---- 交互 ----
pomoBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // 不触发 stage 的单击逻辑
  ensureAudio();
  dispatch('toggle');  // idle → running
});

// 单击/双击并存：单击延迟 250ms 执行，双击到来则取消，避免暂停/继续闪一下
let clickTimer = null;
document.body.addEventListener('click', () => {
  if (pomo.phase === 'idle') return;
  if (pomo.phase === 'done') { dispatch('toggle'); return; } // 任意点击关闭提醒
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => dispatch('toggle'), 250);
});
document.body.addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  if (pomo.phase !== 'idle') dispatch('reset');
});

// 防烧屏：每分钟整体随机位移 ±8px
setInterval(() => {
  const dx = Math.round(Math.random() * 16 - 8);
  const dy = Math.round(Math.random() * 16 - 8);
  stage.style.transform = `translate(${dx}px, ${dy}px)`;
}, 60000);
</script>
```

注意：Task 2 中 `#pomo-btn` 的 `hidden` 属性保留在 HTML 里（首帧由 render 后的 `pomoBtn.hidden = false` 打开），HTML 部分无需改动。

- [ ] **Step 3: 回归测试 + 浏览器验证**

Run: `cd /Users/chenbio/tablet-clock && node --test tests/`
Expected: PASS（逻辑未动，确认没改坏）

浏览器 `http://localhost:8765/` 验收（验证时可临时把 `POMODORO_MS` 缩短——**只许在浏览器 console 里改 DOM/等待，不许改 logic.js**；等 25 分钟不现实，改用 console 验证 done 态：`document.body.classList.add('mode-done')` 看闪烁样式）：
1. 点 ▶：主区域变橙色 `25:00` 倒计时，▶ 按钮消失，秒在减
2. 单击屏幕：变灰色暂停，文案"已暂停…"；再单击继续
3. 双击：回到时钟显示，▶ 重新出现
4. 单击不应闪现"暂停后立刻继续"（250ms 延迟合并生效）
5. Console 无报错

- [ ] **Step 4: Commit**

```bash
cd /Users/chenbio/tablet-clock
git add index.html
git commit -m "feat: 番茄钟（25 分钟倒计时、暂停/重置、结束闪烁+蜂鸣）"
```

---

### Task 4: PWA + iOS 适配（manifest / 图标 / Wake Lock）

**Files:**
- Create: `manifest.webmanifest`
- Create: `icon.png`（用一次性 Python 脚本生成，脚本不入库）
- Modify: `index.html`（head 加 meta/link；script 加 Wake Lock；body 加指示图标）

**Interfaces:**
- Consumes: Task 3 的完整页面
- Produces: 可"添加到主屏幕"的全屏 PWA；`#wake-warn` 指示元素

- [ ] **Step 1: 写 manifest**

创建 `manifest.webmanifest`：

```json
{
  "name": "桌面时钟",
  "short_name": "时钟",
  "display": "fullscreen",
  "orientation": "any",
  "background_color": "#000000",
  "theme_color": "#000000",
  "start_url": ".",
  "icons": [{ "src": "icon.png", "sizes": "512x512", "type": "image/png" }]
}
```

- [ ] **Step 2: 生成图标**

Run（一次性脚本，直接执行不保存）：

```bash
cd /Users/chenbio/tablet-clock && python3 - <<'EOF'
from PIL import Image, ImageDraw
S = 512
img = Image.new('RGB', (S, S), '#000000')
d = ImageDraw.Draw(img)
# 深灰圆形表盘 + 白色时针分针，极简风与页面一致
d.ellipse([56, 56, S-56, S-56], outline='#e8e8ec', width=14)
cx = cy = S // 2
d.line([cx, cy, cx, cy-120], fill='#e8e8ec', width=16)   # 分针指 12
d.line([cx, cy, cx+85, cy+50], fill='#ff9f0a', width=16) # 时针橙色
d.ellipse([cx-14, cy-14, cx+14, cy+14], fill='#e8e8ec')
img.save('icon.png')
print('icon.png saved', img.size)
EOF
```

Expected: `icon.png saved (512, 512)`

- [ ] **Step 3: index.html 加 iOS meta 与 Wake Lock**

`<head>` 中 `<title>` 之前插入：

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#000000">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon.png">
```

`<style>` 末尾追加：

```css
  #wake-warn {
    position: fixed; left: 4vw; bottom: 4vh;
    font-size: 18px; color: #55555c;
  }
  #wake-warn[hidden] { display: none; }
```

`<button id="pomo-btn" …>` 之后加：

```html
<span id="wake-warn" hidden title="屏幕常亮不可用，请在设置中将自动锁定设为永不">☾ 常亮未生效</span>
```

内联 script 末尾（防烧屏 interval 之后）追加：

```js
// ---- Screen Wake Lock：保持屏幕常亮，失败静默降级为角落提示 ----
const wakeWarn = document.getElementById('wake-warn');
let wakeLock = null;
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeWarn.hidden = true;
    wakeLock.addEventListener('release', () => { wakeWarn.hidden = false; });
  } catch {
    wakeWarn.hidden = false;
  }
}
if ('wakeLock' in navigator) {
  requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
} else {
  wakeWarn.hidden = false;
}
```

- [ ] **Step 4: 回归 + 浏览器验证**

Run: `cd /Users/chenbio/tablet-clock && node --test tests/`
Expected: PASS

浏览器 `http://localhost:8765/` 验收：
1. Console 无 manifest/图标 404
2. localhost 属于 secure context，Wake Lock 应成功 → 角落无"☾ 常亮未生效"
3. DevTools Application 面板能看到 manifest 信息与图标

- [ ] **Step 5: Commit**

```bash
cd /Users/chenbio/tablet-clock
git add manifest.webmanifest icon.png index.html
git commit -m "feat: PWA manifest、主屏幕图标、Wake Lock 常亮"
```

---

### Task 5: 部署 GitHub Pages + README

**前置条件：** `gh auth status` 显示已登录（用户需先完成 `gh auth login`）。未登录则停下向用户要求登录，不要用其他方式绕过。

**Files:**
- Create: `README.md`
- Remote: GitHub 公开仓库 `tablet-clock` + Pages

**Interfaces:**
- Consumes: 全部已提交文件
- Produces: 线上 URL `https://<owner>.github.io/tablet-clock/`

- [ ] **Step 1: 写 README（含 iPad 设置步骤）**

创建 `README.md`：

```markdown
# 桌面时钟 tablet-clock

iPad 全屏桌面时钟：大字数字钟 + 日期星期 + 25 分钟番茄钟。
纯静态单页，零依赖，托管在 GitHub Pages。

## iPad 设置步骤

1. Safari 打开 `https://<owner>.github.io/tablet-clock/`（换成实际地址）
2. 分享按钮 → **添加到主屏幕** → 从主屏幕点开，即为无边框全屏
3. 建议：设置 → 显示与亮度 → **自动锁定 → 永不**（Wake Lock 的兜底）
4. 长期使用请插电源，亮度适当调低
5. 可选：设置 → 辅助功能 → 引导式访问，防误触退出

## 操作

- 右下角 ▶：开始 25 分钟番茄钟
- 倒计时中单击：暂停/继续；双击：重置回时钟
- 结束时闪屏 + 蜂鸣，任意点击返回时钟
- 左下角出现"☾ 常亮未生效"= Wake Lock 不可用，请按上面第 3 步设置

## 开发

- 逻辑测试：`node --test tests/`
- 本地预览：`python3 -m http.server 8765`
- 改完 push 到 main 即自动更新线上
```

（README 中 `<owner>` 在 Step 2 拿到实际用户名后替换成真实地址再提交。）

- [ ] **Step 2: 建仓库并推送**

```bash
cd /Users/chenbio/tablet-clock
gh auth status || { echo '未登录，停止'; exit 1; }
OWNER=$(gh api user -q .login)
sed -i '' "s/<owner>/$OWNER/g" README.md
git add README.md
git commit -m "docs: README 与 iPad 设置步骤"
gh repo create tablet-clock --public --source=. --push
```

Expected: 仓库创建成功并推送 main。

- [ ] **Step 3: 开启 Pages**

```bash
gh api -X POST "repos/$OWNER/tablet-clock/pages" \
  -f "source[branch]=main" -f "source[path]=/"
```

Expected: 返回 JSON 含 `"status"`。若已存在（422）视为成功。

- [ ] **Step 4: 验证线上可访问**

```bash
sleep 60
curl -sI "https://$OWNER.github.io/tablet-clock/" | head -1
```

Expected: `HTTP/2 200`（Pages 首次构建可能要几分钟，200 之前每 30s 重试，最多 10 次）

浏览器打开线上 URL 复核一遍 Task 2–4 的验收点（尤其 HTTPS 下 Wake Lock 生效）。

- [ ] **Step 5: 告知用户 iPad 实测**

输出线上 URL 与 README 中的 iPad 设置步骤，请用户在 iPad 上按步骤添加并实测：
全屏无边框、常亮、番茄钟蜂鸣（首次需点过 ▶）。iPad 实测只能由用户完成。

---

## Self-Review 记录

- Spec 覆盖：时钟/日期星期/秒 → Task 1+2；番茄钟 → Task 1+3；常亮+降级 → Task 4；
  防烧屏 → Task 2；PWA 全屏 → Task 4；GitHub Pages → Task 5；断网可用 → 零网络请求（全局约束）✓
- 占位符扫描：README 的 `<owner>` 在 Task 5 Step 2 有明确替换命令，非悬空占位 ✓
- 类型一致性：`transition/remainingMs/formatCountdown` 签名在 Task 1 定义、Task 3 使用一致；
  DOM id（stage/time/date/pomo-btn/wake-warn）跨 Task 一致 ✓
