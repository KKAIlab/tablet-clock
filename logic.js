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
