import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChoices, isCorrectAnswer } from '../src/choices.ts';
import { dayKey } from '../src/days.ts';
import { compareStroke, pathLength, type Point, resample } from '../src/handwriting.ts';
import { getKana, KANA, supportsDirection } from '../src/kana.ts';
import { mistakesOnDay, mixUpOf } from '../src/mistakes.ts';
import {
  affectsPractice,
  canForgiveTypo,
  forgiveTypo,
  goalProgress,
  justReachedGoal,
  newSession,
  submitAnswer,
  undoAnswer,
} from '../src/session.ts';
import { defaultState, migrateState, STATE_VERSION, updateSettings } from '../src/state.ts';
import type { Card, Session, Settings, State } from '../src/types.ts';
import { kanaPadRows } from '../src/ui/practice/kana-pad.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const vowels = (changes: Partial<Settings> = {}): State =>
  updateSettings(defaultState(), { rows: ['basic:Vowels'], ...changes });

function sessionWith(kana: string, changes: Partial<Card> = {}): Session {
  return {
    ...newSession(),
    card: {
      item: getKana(kana),
      kind: 'new',
      choices: [],
      answered: false,
      revealed: false,
      untimed: false,
      shownAt: 0,
      outcome: null,
      given: null,
      ...changes,
    },
  };
}

test('submitAnswer remembers the outcome and how to undo it', () => {
  const state = vowels();
  const result = submitAnswer(state, sessionWith('あ'), 'o', { now: NOW, clock: 1200 });
  assert.ok(result);
  assert.equal(result.session.card?.outcome, 'wrong');
  assert.equal(result.session.card.given, 'o');
  assert.equal(result.session.undo?.state, state);
  assert.equal(result.session.undo.clock, 1200);
});

test('undoAnswer restores the saved state and shows the card again with a fresh timer', () => {
  const state = vowels();
  const result = submitAnswer(state, sessionWith('あ'), 'o', { now: NOW, clock: 1200 });
  assert.ok(result);
  const restored = undoAnswer(result.session, 5000);
  assert.ok(restored);
  assert.equal(restored.state, state);
  assert.equal(restored.session.card?.answered, false);
  assert.equal(restored.session.card.shownAt, 5000);
  assert.equal(restored.session.answered, 0);
  assert.equal(undoAnswer(newSession(), 0), null);
});

test('a typo can be forgiven only after a wrong typed answer', () => {
  const state = vowels();
  const wrong = submitAnswer(state, sessionWith('あ'), 'aa', { now: NOW, clock: 1500 });
  assert.ok(wrong);
  assert.ok(canForgiveTypo(wrong.state, wrong.session));

  const forgiven = forgiveTypo(wrong.state, wrong.session, NOW);
  assert.ok(forgiven);
  assert.equal(forgiven.outcome, 'correct');
  assert.equal(forgiven.state.mistakes.length, 0);
  assert.equal(forgiven.state.stats['あ']?.wrong, 0);
  assert.deepEqual([forgiven.session.answered, forgiven.session.correct], [1, 1]);
  assert.equal(forgiven.ms, 1500);

  const right = submitAnswer(state, sessionWith('あ'), 'a', { now: NOW, clock: 1500 });
  assert.ok(right && !canForgiveTypo(right.state, right.session));
  const choose = vowels({ mode: 'choose' });
  const picked = submitAnswer(choose, sessionWith('あ'), 'o', { now: NOW, clock: 1500 });
  assert.ok(picked && !canForgiveTypo(picked.state, picked.session));
  const peeked = submitAnswer(state, sessionWith('あ', { revealed: true }), 'o', { now: NOW, clock: 1500 });
  assert.ok(peeked && !canForgiveTypo(peeked.state, peeked.session));
  assert.equal(forgiveTypo(state, newSession(), NOW), null);
});

test('turning the speed check off means slow answers still count fully', () => {
  const slow = submitAnswer(vowels(), sessionWith('あ'), 'a', { now: NOW, clock: 30_000 });
  assert.equal(slow?.outcome, 'slow');
  const off = submitAnswer(vowels({ speedCheck: 'off' }), sessionWith('あ'), 'a', { now: NOW, clock: 30_000 });
  assert.equal(off?.outcome, 'correct');
});

test('goalProgress and justReachedGoal follow the session goal', () => {
  const settings = vowels({ goal: 10 }).settings;
  const nine = { ...newSession(), answered: 9 };
  const ten = { ...nine, answered: 10 };
  assert.equal(goalProgress(vowels().settings, nine), null);
  assert.deepEqual(goalProgress(settings, nine), { goal: 10, done: 9, reached: false });
  assert.equal(goalProgress(settings, ten)?.reached, true);
  assert.ok(justReachedGoal(settings, nine, ten));
  assert.ok(!justReachedGoal(settings, ten, { ...ten, answered: 11 }));
  assert.ok(!justReachedGoal(vowels().settings, nine, ten));
});

test('affectsPractice ignores display-only settings', () => {
  const base = vowels().settings;
  assert.ok(!affectsPractice(base, { ...base, theme: 'dark', kanaPad: true, goal: 25, speedCheck: 'off' }));
  assert.ok(affectsPractice(base, { ...base, direction: 'listen' }));
  assert.ok(affectsPractice(base, { ...base, rows: [...base.rows, 'basic:K-row'] }));
  assert.ok(!affectsPractice(base, { ...base, rows: [...base.rows] }));
});

test('version 4 saves gain the new settings with defaults, and bad values are replaced', () => {
  const upgraded = migrateState({ version: 4, settings: { direction: 'match' } }, NOW);
  assert.equal(upgraded.version, STATE_VERSION);
  assert.deepEqual(
    [upgraded.settings.goal, upgraded.settings.speedCheck, upgraded.settings.theme, upgraded.settings.kanaPad],
    [0, 'adaptive', 'system', false],
  );
  const cleaned = migrateState(
    { version: 5, settings: { theme: 'neon', goal: 7, speedCheck: 'fast', kanaPad: 'yes', direction: 'listen' } },
    NOW,
  );
  assert.deepEqual(
    [cleaned.settings.theme, cleaned.settings.goal, cleaned.settings.speedCheck, cleaned.settings.kanaPad],
    ['system', 0, 'adaptive', false],
  );
  assert.equal(cleaned.settings.direction, 'listen');
  const listenStats = migrateState(
    { version: 5, stats: { 'listen:あ': { box: 2, due: NOW }, 'listen:やま': {} } },
    NOW,
  );
  assert.deepEqual(Object.keys(listenStats.stats), ['listen:あ']);
});

test('listening works like recall: same-script kana, no words', () => {
  assert.ok(supportsDirection(getKana('か'), 'listen'));
  assert.ok(!supportsDirection(getKana('やま'), 'listen'));
  assert.ok(isCorrectAnswer(getKana('か'), 'listen', 'か'));
  assert.ok(!isCorrectAnswer(getKana('か'), 'listen', 'ka'));
  const target = getKana('じ');
  const choices = buildChoices(target, { direction: 'listen', pool: KANA.filter(k => k.script === 'hiragana') });
  assert.ok(choices.includes('じ'));
  assert.ok(!choices.includes('ぢ'), 'ぢ sounds the same as じ');
  const mixUp = mixUpOf({ kana: 'シ', given: 'ツ', at: NOW, direction: 'listen' });
  assert.deepEqual(
    mixUp?.map(k => k.kana),
    ['シ', 'ツ'],
  );
});

test('mistakesOnDay keeps only that local day', () => {
  const yesterday = NOW - 24 * 60 * 60 * 1000;
  const mistakes = [NOW, yesterday, NOW - 1000].map(at => ({ kana: 'あ', given: 'o', at, direction: 'read' as const }));
  assert.equal(mistakesOnDay(mistakes, dayKey(NOW)).length, 2);
  assert.equal(mistakesOnDay(mistakes, dayKey(yesterday)).length, 1);
});

const line = (from: Point, to: Point, steps = 20): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y + ((to.y - from.y) * i) / steps,
  }));

test('resample spreads points evenly and keeps both ends', () => {
  const points = resample(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 30 },
    ],
    5,
  );
  assert.equal(points.length, 5);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  assert.deepEqual(points[4], { x: 10, y: 30 });
  assert.deepEqual(points[1], { x: 10, y: 0 });
  assert.equal(pathLength(points), 40);
  assert.deepEqual(resample([], 4), []);
});

test('compareStroke accepts a wobbly copy and explains what went wrong otherwise', () => {
  const expected = line({ x: 20, y: 30 }, { x: 90, y: 30 });
  const wobbly = expected.map((point, i) => ({ x: point.x + (i % 2 ? 3 : -3), y: point.y + (i % 3) * 2 }));
  assert.equal(compareStroke(wobbly, expected), 'ok');
  assert.equal(compareStroke([...expected].reverse(), expected), 'start');
  assert.equal(compareStroke(line({ x: 20, y: 30 }, { x: 25, y: 30 }), expected), 'too-short');
  assert.equal(compareStroke(line({ x: 20, y: 30 }, { x: 60, y: 90 }), expected), 'end');
  const detour = [...line({ x: 20, y: 30 }, { x: 55, y: 95 }), ...line({ x: 55, y: 95 }, { x: 90, y: 30 })];
  assert.equal(compareStroke(detour, expected), 'shape');
});

test('kanaPadRows has every basic and dakuten row plus small kana for the script', () => {
  const hiragana = kanaPadRows('hiragana');
  assert.deepEqual(hiragana[0], ['あ', 'い', 'う', 'え', 'お']);
  assert.ok(hiragana.flat().includes('ぱ'));
  assert.ok(hiragana.at(-1)?.includes('ゃ'));
  const katakana = kanaPadRows('katakana').flat();
  assert.ok(katakana.includes('ヴ') && katakana.includes('ッ') && katakana.includes('ー'));
  assert.ok(!katakana.includes('あ'));
});
