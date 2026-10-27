import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey } from '../src/days.ts';
import { getKana } from '../src/kana.ts';
import { mergeStates } from '../src/merge.ts';
import {
  clearMistakes,
  combinedDays,
  defaultState,
  MAX_DEVICES,
  recordAnswer,
  resetProgress,
  updateSettings,
} from '../src/state.ts';
import type { Outcome, State } from '../src/types.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const MINUTE = 60 * 1000;
const at = (minutes: number) => NOW + minutes * MINUTE;
const daysAgo = (n: number) => new Date(2026, 0, 10 - n, 12).getTime();

const answer = (state: State, kana: string, now: number, outcome: Outcome = 'correct') =>
  recordAnswer(state, { item: getKana(kana), direction: 'read', outcome, given: 'x', ms: 1000, now, run: 1 });

test('each card keeps its most recent review from either device', () => {
  const phone = answer(answer(defaultState(), 'あ', at(1)), 'い', at(5), 'wrong');
  const laptop = answer(answer(defaultState(), 'あ', at(3), 'wrong'), 'う', at(2));
  const merged = mergeStates(phone, 'phone', laptop, 'laptop');
  assert.deepEqual(Object.keys(merged.stats).sort(), ['あ', 'い', 'う']);
  assert.equal(merged.stats.あ, laptop.stats.あ);
  assert.equal(merged.stats.い, phone.stats.い);
  assert.equal(mergeStates(laptop, 'laptop', phone, 'phone').stats.あ, laptop.stats.あ);
});

test('day logs are kept per device, added up for display and never counted twice', () => {
  const phone = answer(answer(defaultState(), 'あ', at(1)), 'い', at(2));
  const laptop = answer(defaultState(), 'う', at(3));
  const onLaptop = mergeStates(laptop, 'laptop', phone, 'phone');
  assert.equal(onLaptop.days[dayKey(NOW)]?.answers, 1);
  assert.equal(onLaptop.deviceDays.phone?.[dayKey(NOW)]?.answers, 2);
  assert.equal(combinedDays(onLaptop)[dayKey(NOW)]?.answers, 3);
  assert.equal(combinedDays(onLaptop), combinedDays(onLaptop));

  const again = mergeStates(onLaptop, 'laptop', phone, 'phone');
  assert.equal(combinedDays(again)[dayKey(NOW)]?.answers, 3);

  // The phone gets its own log back from the laptop's upload, and keeps the larger copy.
  const onPhone = mergeStates(answer(phone, 'え', at(4)), 'phone', onLaptop, 'laptop');
  assert.equal(onPhone.days[dayKey(NOW)]?.answers, 3);
  assert.deepEqual(Object.keys(onPhone.deviceDays), ['laptop']);
  assert.equal(combinedDays(onPhone)[dayKey(NOW)]?.learned, 4);
  const alone = defaultState();
  assert.equal(combinedDays(alone), alone.days);
});

test('mistakes from both devices are combined once each, and clearing them sticks', () => {
  const phone = answer(defaultState(), 'あ', at(1), 'wrong');
  const laptop = answer(mergeStates(defaultState(), 'laptop', phone, 'phone'), 'い', at(2), 'wrong');
  const merged = mergeStates(phone, 'phone', laptop, 'laptop');
  assert.deepEqual(
    merged.mistakes.map(m => m.kana),
    ['い', 'あ'],
  );

  const cleared = clearMistakes(merged, at(3));
  assert.deepEqual(mergeStates(cleared, 'phone', laptop, 'laptop').mistakes, []);
  const later = answer(laptop, 'う', at(4), 'wrong');
  assert.deepEqual(
    mergeStates(cleared, 'phone', later, 'laptop').mistakes.map(m => m.kana),
    ['う'],
  );
});

test('the most recently changed settings win', () => {
  const phone = updateSettings(defaultState(), { direction: 'recall' }, at(1));
  const laptop = updateSettings(defaultState(), { goal: 25 }, at(2));
  const merged = mergeStates(phone, 'phone', laptop, 'laptop');
  assert.equal(merged.settings.goal, 25);
  assert.equal(merged.settings.direction, 'read');
  assert.equal(merged.settingsChangedAt, at(2));
  assert.equal(mergeStates(laptop, 'laptop', phone, 'phone').settings.goal, 25);
});

test('a reset on one device wipes the older progress on the others', () => {
  const old = answer(answer(defaultState(), 'あ', daysAgo(2), 'wrong'), 'い', daysAgo(1));
  const laptop = { ...old, deviceDays: { tablet: old.days }, bestStreak: 9, lastBackup: daysAgo(1) };
  const phone = answer(resetProgress(old, at(1)), 'う', at(2));

  const merged = mergeStates(phone, 'phone', laptop, 'laptop');
  assert.deepEqual(Object.keys(merged.stats), ['う']);
  assert.deepEqual(merged.mistakes, []);
  assert.deepEqual(Object.keys(merged.deviceDays.laptop ?? {}), []);
  assert.deepEqual(Object.keys(merged.deviceDays.tablet ?? {}), []);
  assert.equal(merged.bestStreak, 1);
  assert.equal(merged.lastBackup, daysAgo(1));
  assert.equal(merged.resetAt, at(1));

  const otherWay = mergeStates(laptop, 'laptop', phone, 'phone');
  assert.deepEqual(Object.keys(otherWay.stats), ['う']);
  assert.equal(otherWay.days[dayKey(daysAgo(1))], undefined);
});

test('only the most recently active devices are kept', () => {
  const remote: State = {
    ...defaultState(),
    deviceDays: Object.fromEntries(
      Array.from({ length: MAX_DEVICES + 3 }, (_, i) => [`d${i}`, { [dayKey(daysAgo(i))]: defaultDay() }]),
    ),
  };
  const merged = mergeStates(defaultState(), 'me', remote, 'other');
  assert.equal(Object.keys(merged.deviceDays).length, MAX_DEVICES);
  assert.ok('d0' in merged.deviceDays);
  assert.ok(!(`d${MAX_DEVICES + 2}` in merged.deviceDays));
});

function defaultDay() {
  return { answers: 1, learned: 0, scored: 1, correct: 1 };
}
