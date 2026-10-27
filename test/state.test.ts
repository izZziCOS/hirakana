import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey } from '../src/days.ts';
import { getKana } from '../src/kana.ts';
import { intervalFor, MAX_BOX } from '../src/schedule.ts';
import {
  clearMistakes,
  defaultState,
  exportPayload,
  groupSelection,
  MAX_MISTAKES,
  migrateState,
  parseImport,
  recordAnswer,
  resetProgress,
  rowsSummary,
  STATE_VERSION,
  toggleGroup,
  toggleRow,
  updateSettings,
} from '../src/state.ts';
import {
  createAppStores,
  createSaver,
  createStore,
  type KeyValueStorage,
  loadState,
  SAVE_DELAY_MS,
  saveState,
  STORAGE_KEY,
} from '../src/store.ts';
import type { State } from '../src/types.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const daysAgo = (n: number) => new Date(2026, 0, 10 - n, 12).getTime();

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: key => {
      data.delete(key);
    },
  };
}

const answer = (state: State, kana: string, outcome: 'correct' | 'wrong' | 'slow' | 'peeked', run = 0) =>
  recordAnswer(state, { item: getKana(kana), direction: 'read', outcome, given: 'x', ms: 1000, now: NOW, run });

test('migrateState upgrades version 1 data all the way', () => {
  const v1 = {
    settings: { script: 'katakana', groups: ['basic', 'yoon'], mode: 'choose' },
    stats: {
      ア: { correct: 4, wrong: 0, streak: 4, last: daysAgo(1) },
      イ: { correct: 1, wrong: 2, streak: 0, last: daysAgo(1) },
      ウ: { correct: 1, wrong: 1, streak: 1, last: daysAgo(3) },
    },
    mistakes: [{ kana: 'イ', given: 'ri', at: NOW }],
    bestStreak: 7,
  };
  const state = migrateState(v1, NOW);
  assert.equal(state.version, STATE_VERSION);
  assert.equal(state.settings.script, 'katakana');
  assert.equal(state.settings.mode, 'choose');
  assert.equal(state.settings.direction, 'read');
  assert.ok(state.settings.rows.includes('basic:K-row'));
  assert.ok(state.settings.rows.includes('yoon:KY'));
  assert.ok(!state.settings.rows.some(id => id.startsWith('dakuten:')));
  assert.equal(state.stats['ア']?.box, 3);
  assert.equal(state.stats['イ']?.box, 1);
  assert.equal(state.stats['ウ']?.box, 2);
  assert.equal(state.stats['ア'].due, NOW);
  assert.deepEqual(state.mistakes, [{ kana: 'イ', given: 'ri', at: NOW, direction: 'read' }]);
  assert.deepEqual(state.days, {
    [dayKey(daysAgo(3))]: { answers: 1, learned: 0, scored: 0, correct: 0 },
    [dayKey(daysAgo(1))]: { answers: 2, learned: 0, scored: 0, correct: 0 },
  });
  assert.equal(state.bestStreak, 7);
});

test('migrateState keeps per-direction stats and drops unsupported ones', () => {
  const state = migrateState(
    {
      version: 3,
      settings: { direction: 'recall', newPerDay: 25 },
      stats: {
        'recall:あ': { box: 2, due: NOW },
        'match:ファ': { box: 2, due: NOW },
        'recall:やま': { box: 2, due: NOW },
      },
    },
    NOW,
  );
  assert.equal(state.settings.direction, 'recall');
  assert.equal(state.settings.newPerDay, 25);
  assert.deepEqual(Object.keys(state.stats), ['recall:あ']);
});

test('migrateState drops unknown and malformed data', () => {
  const state = migrateState(
    {
      version: 4,
      settings: { script: 'cyrillic', rows: ['nope:row'], mode: 'guess', direction: 'sideways', newPerDay: 7 },
      stats: { あ: { correct: -3, wrong: 'x', box: 99, due: NOW }, Ω: { correct: 1 } },
      mistakes: [{ kana: 'あ', given: 5, at: NOW, direction: 'up' }, { kana: 'Ω', at: NOW }, 'junk'],
      days: { 'not-a-day': { answers: 1 }, '2026-01-01': 'x' },
      bestStreak: -1,
    },
    NOW,
  );
  assert.deepEqual(state.settings, defaultState().settings);
  assert.deepEqual(Object.keys(state.stats), ['あ']);
  assert.equal(state.stats['あ']?.correct, 0);
  assert.equal(state.stats['あ'].box, MAX_BOX);
  assert.deepEqual(state.mistakes, [{ kana: 'あ', given: '', at: NOW, direction: 'read' }]);
  assert.deepEqual(state.days, {});
  assert.equal(state.bestStreak, 0);
});

test('migrateState sorts mistakes newest first and falls back to defaults for junk', () => {
  const mistakes = [NOW - 5, NOW, NOW - 9].map(at => ({ kana: 'あ', given: 'o', at }));
  assert.deepEqual(
    migrateState({ version: 4, mistakes }, NOW).mistakes.map(m => m.at),
    [NOW, NOW - 5, NOW - 9],
  );
  [null, undefined, 'text', 42, []].forEach(raw => assert.deepEqual(migrateState(raw, NOW), defaultState()));
});

test('export and import round-trip the progress', () => {
  let state = updateSettings(defaultState(), { direction: 'match' });
  state = answer(state, 'か', 'correct', 2);
  state = answer(state, 'き', 'wrong');
  const text = JSON.stringify(exportPayload(state, NOW));
  assert.deepEqual(parseImport(text, NOW), state);
});

test('import rejects files that are not Kana Dojo exports', () => {
  assert.throws(() => parseImport('not json'), /valid JSON/);
  assert.throws(() => parseImport('{"hello":1}'), /Kana Dojo progress export/);
  const future = JSON.stringify({ app: 'kana-dojo', data: { version: STATE_VERSION + 1 } });
  assert.throws(() => parseImport(future), /newer version/);
});

test('recordAnswer updates stats, the day log, mistakes and the best run', () => {
  const start = defaultState();
  const afterCorrect = answer(start, 'あ', 'correct', 4);
  assert.equal(afterCorrect.stats['あ']?.box, 2);
  assert.deepEqual(afterCorrect.days[dayKey(NOW)], { answers: 1, learned: 1, scored: 1, correct: 1 });
  assert.equal(afterCorrect.bestStreak, 4);
  assert.equal(afterCorrect.mistakes, start.mistakes);
  assert.equal(start.stats['あ'], undefined, 'the previous state is not mutated');

  const afterWrong = answer(afterCorrect, 'あ', 'wrong');
  assert.equal(afterWrong.mistakes.length, 1);
  assert.deepEqual(afterWrong.days[dayKey(NOW)], { answers: 2, learned: 1, scored: 2, correct: 1 });

  const afterPeek = answer(afterWrong, 'い', 'peeked');
  assert.equal(afterPeek.stats['い']?.due, NOW + intervalFor(1));
  assert.deepEqual(afterPeek.days[dayKey(NOW)], { answers: 3, learned: 2, scored: 2, correct: 1 });
  assert.equal(afterPeek.settings, start.settings, 'answers never replace the settings object');
});

test('recordAnswer caps the mistake history', () => {
  let state: State = {
    ...defaultState(),
    mistakes: Array.from({ length: MAX_MISTAKES }, () => ({
      kana: 'あ',
      given: 'x',
      at: 1,
      direction: 'read' as const,
    })),
  };
  state = answer(state, 'い', 'wrong');
  assert.equal(state.mistakes.length, MAX_MISTAKES);
  assert.equal(state.mistakes[0]?.kana, 'い');
});

test('toggleRow and toggleGroup never leave nothing selected', () => {
  const start = updateSettings(defaultState(), { rows: ['basic:Vowels'] });
  assert.equal(toggleRow(start, 'basic:Vowels'), start);
  assert.deepEqual(toggleRow(start, 'basic:K-row').settings.rows, ['basic:Vowels', 'basic:K-row']);

  const withDakuten = toggleGroup(start, 'dakuten');
  assert.equal(groupSelection(withDakuten, 'dakuten'), 'all');
  assert.equal(groupSelection(withDakuten, 'basic'), 'some');
  assert.equal(rowsSummary(withDakuten), 'Basic 1/11, Dakuten');
  assert.equal(toggleGroup(toggleGroup(defaultState(), 'basic'), 'basic').settings.rows.length, 11);
});

test('clearMistakes and resetProgress keep what they should', () => {
  const state = answer(updateSettings(defaultState(), { script: 'both' }), 'あ', 'wrong', 3);
  assert.deepEqual(clearMistakes(state).mistakes, []);
  assert.equal(clearMistakes(state).stats, state.stats);
  const reset = resetProgress(state);
  assert.deepEqual(reset.stats, {});
  assert.equal(reset.settings, state.settings);
  assert.equal(reset.bestStreak, 0);
});

test('createStore notifies subscribers only when the value changes', () => {
  const store = createStore({ count: 0 });
  const seen: [number, number][] = [];
  const unsubscribe = store.subscribe((value, previous) => seen.push([previous.count, value.count]));
  store.update(value => ({ count: value.count + 1 }));
  store.update(value => value);
  unsubscribe();
  store.update(value => ({ count: value.count + 1 }));
  assert.deepEqual(seen, [[0, 1]]);
  assert.equal(store.get().count, 2);
});

test('loadState reads the legacy storage key and saveState moves it to the new one', () => {
  const legacy = { version: 3, settings: { script: 'both' }, bestStreak: 5 };
  const storage = memoryStorage({ 'kana-dojo-v1': JSON.stringify(legacy) });
  const state = loadState(storage, NOW);
  assert.equal(state.settings.script, 'both');
  assert.equal(state.bestStreak, 5);
  saveState(storage, state);
  assert.deepEqual([...storage.data.keys()], [STORAGE_KEY]);
  assert.equal(loadState(storage, NOW).bestStreak, 5);
});

test('loadState survives broken or missing storage', () => {
  assert.deepEqual(loadState(null, NOW), defaultState());
  assert.deepEqual(loadState(memoryStorage({ [STORAGE_KEY]: '{oops' }), NOW), defaultState());
  const throwing: KeyValueStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => undefined,
  };
  assert.deepEqual(loadState(throwing, NOW), defaultState());
  assert.doesNotThrow(() => saveState(throwing, defaultState()));
});

test('createSaver batches writes and flush saves immediately', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  const saver = createSaver(storage, 400);
  saver.schedule({ ...defaultState(), bestStreak: 1 });
  saver.schedule({ ...defaultState(), bestStreak: 2 });
  assert.equal(storage.data.size, 0);
  t.mock.timers.tick(399);
  assert.equal(storage.data.size, 0);
  t.mock.timers.tick(1);
  assert.equal(loadState(storage, NOW).bestStreak, 2);

  saver.schedule({ ...defaultState(), bestStreak: 3 });
  saver.flush();
  assert.equal(loadState(storage, NOW).bestStreak, 3);
  saver.flush();
  assert.equal(loadState(storage, NOW).bestStreak, 3);
});

test('createAppStores loads saved progress and saves changes after a short delay', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 5, bestStreak: 4 }) });
  const { data, session, saver } = createAppStores(storage);
  assert.equal(data.get().bestStreak, 4);
  assert.equal(session.get().card, null);
  data.update(state => ({ ...state, bestStreak: 9 }));
  assert.equal(loadState(storage, NOW).bestStreak, 4);
  t.mock.timers.tick(SAVE_DELAY_MS);
  assert.equal(loadState(storage, NOW).bestStreak, 9);
  saver.flush();
});
