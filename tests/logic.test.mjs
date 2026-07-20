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
