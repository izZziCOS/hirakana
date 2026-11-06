import assert from 'node:assert/strict';
import test from 'node:test';
import { isKanaText } from '../src/decks.ts';
import { readingOf, parseSentence } from '../src/furigana.ts';
import { getKana, KANA, statKey } from '../src/kana.ts';
import '../src/kanji.ts';
import { mergeStates } from '../src/merge.ts';
import { buildMockTest, formatClock, MOCK_SECTION_SIZE, MOCK_SECTIONS, scoreMock } from '../src/mock-test.ts';
import { PASSAGES } from '../src/passages-data.ts';
import { JLPT_LEVELS, lastMock, levelReadiness, nextGoal, READY_PERCENT } from '../src/readiness.ts';
import {
  defaultState,
  MAX_MOCK_TESTS,
  migrateState,
  recordMockTest,
  recordPassage,
  resetProgress,
  STATE_VERSION,
} from '../src/state.ts';
import type { Stat, State } from '../src/types.ts';
import { toMarkup } from '../src/ui/html.ts';
import { readinessMarkup } from '../src/ui/readiness.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const mastered: Stat = { correct: 9, wrong: 0, streak: 9, box: 6, due: NOW, last: NOW };
const learning: Stat = { ...mastered, box: 2 };
const n5 = (state: State) => levelReadiness(state).find(entry => entry.level === 5);

test('readiness counts each level’s kanji, words and grammar, starting from nothing', () => {
  const levels = levelReadiness(defaultState());
  assert.deepEqual(
    levels.map(entry => entry.level),
    JLPT_LEVELS,
  );
  for (const entry of levels) {
    assert.equal(entry.percent, 0);
    for (const section of [entry.kanji, entry.words, entry.grammar]) {
      assert.ok(section.total > 0);
      assert.equal(section.known + section.learning, 0);
    }
  }
  const first = levels[0];
  assert.equal(first?.kanji.total, 80);
  assert.equal(first.grammar.total, KANA.filter(item => item.group === 'g5').length);
});

test('a card is known once mastered in any direction, and learning if merely seen', () => {
  const state: State = {
    ...defaultState(),
    stats: {
      [statKey(getKana('水'), 'meaning')]: mastered,
      [statKey(getKana('火'))]: learning,
      [statKey(getKana('~wa-topic/1'), 'cloze')]: mastered,
    },
  };
  const entry = n5(state);
  assert.equal(entry?.kanji.known, 1);
  assert.equal(entry.kanji.learning, 1);
  assert.equal(entry.grammar.known, 1);
  assert.equal(entry.words.known, 0);
});

test('a level’s share is the average of its three sections, so its long word list doesn’t decide it', () => {
  const kanji = KANA.filter(item => item.group === 'k5');
  const stats = Object.fromEntries(kanji.map(item => [statKey(item), mastered]));
  assert.equal(n5({ ...defaultState(), stats })?.percent, 33);
});

test('the next goal is the easiest level not yet within reach', () => {
  const levels = levelReadiness(defaultState());
  assert.equal(nextGoal(levels)?.level, 5);
  const past = levels.map(entry => (entry.level === 5 ? { ...entry, percent: READY_PERCENT } : entry));
  assert.equal(nextGoal(past)?.level, 4);
  assert.equal(nextGoal(levels.map(entry => ({ ...entry, percent: 100 }))), undefined);
});

test('readiness is drawn with numbers beside every bar, and the latest mock test', () => {
  const state = recordMockTest(defaultState(), { level: 5, correct: 21, total: 30, at: NOW });
  const markup = toMarkup(readinessMarkup(state));
  assert.match(markup, /Next goal: N5/);
  assert.match(markup, /data-mock="1"/);
  assert.match(markup, /Last mock test: 21\/30/);
  assert.match(markup, /aria-label="Kanji: 0 known, 0 learning, 80 not started, of 80"/);
  assert.match(markup, />Known</);
  assert.match(markup, /not a prediction|rather than a prediction/);
  assert.equal(lastMock(state, 4), undefined);
  const all = levelReadiness(defaultState()).length;
  assert.equal(all, 5);
});

test('every level can make a full mock test: ten of each, right kind, four options', () => {
  const round = (level: 1 | 2 | 3 | 4 | 5) => buildMockTest(level);
  for (const level of JLPT_LEVELS) {
    const questions = round(level);
    assert.equal(questions.length, MOCK_SECTIONS.length * MOCK_SECTION_SIZE, `N${level}`);
    assert.equal(new Set(questions.map(question => question.item.id)).size, questions.length);
    for (const question of questions) {
      assert.equal(new Set(question.choices).size, 4, question.item.id);
      const expected = { kanji: `k${level}`, words: `n${level}`, grammar: `g${level}` }[question.section];
      assert.equal(question.item.group, expected);
    }
    const grammar = questions.filter(question => question.section === 'grammar');
    assert.equal(new Set(grammar.map(question => question.item.rowId)).size, grammar.length);
  }
});

test('a mock test is scored per section, with what was skipped or not reached counted as missed', () => {
  const questions = buildMockTest(5);
  const right = (i: number) => {
    const question = questions[i];
    if (!question) return null;
    if (question.direction === 'read') return question.item.romaji;
    if (question.direction === 'meaning') return question.item.meanings?.[0] ?? '';
    return question.item.cloze?.answers[0] ?? '';
  };
  const perfect = scoreMock(
    questions,
    questions.map((_, i) => right(i)),
  );
  assert.equal(perfect.correct, questions.length);
  assert.deepEqual(perfect.missed, []);

  const partial = scoreMock(questions, [right(0), null, 'not this']);
  assert.equal(partial.correct, 1);
  assert.equal(partial.total, questions.length);
  assert.equal(partial.missed.length, questions.length - 1);
  assert.deepEqual(partial.sections.kanji, { correct: 1, total: MOCK_SECTION_SIZE });
  assert.deepEqual(partial.sections.grammar, { correct: 0, total: MOCK_SECTION_SIZE });
});

test('the clock counts down in minutes and seconds and stops at zero', () => {
  assert.equal(formatClock(900), '15:00');
  assert.equal(formatClock(65), '1:05');
  assert.equal(formatClock(0.4), '0:01');
  assert.equal(formatClock(-3), '0:00');
});

test('mock results and passages read are saved, sanitised, kept in a limit and synced', () => {
  assert.equal(STATE_VERSION, 11);
  const withMock = recordMockTest(defaultState(), { level: 3, correct: 10, total: 30, at: NOW });
  const state = recordPassage(withMock, 'my-day', 2, 3, NOW);
  const saved = migrateState(JSON.parse(JSON.stringify(state)), NOW);
  assert.deepEqual(saved.mockTests, state.mockTests);
  assert.deepEqual(saved.passages, { 'my-day': { correct: 2, total: 3, at: NOW } });

  const dirty = migrateState({
    version: 9,
    mockTests: [{ level: 9 }, 'x', { level: 2, correct: -1, total: 'a', at: 5 }],
    passages: { 'NOT VALID': { correct: 1 }, 'my-day': 'x', ok: { correct: 1, total: 'x' } },
  });
  assert.deepEqual(dirty.mockTests, [{ level: 2, correct: 0, total: 0, at: 5 }]);
  assert.deepEqual(dirty.passages, { ok: { correct: 1, total: 0, at: 0 } });
  assert.deepEqual(migrateState({ version: 9 }).mockTests, []);

  let many = defaultState();
  for (let i = 0; i < MAX_MOCK_TESTS + 5; i++) many = recordMockTest(many, { level: 5, correct: 1, total: 30, at: i });
  assert.equal(many.mockTests.length, MAX_MOCK_TESTS);
  assert.equal(many.mockTests[0]?.at, MAX_MOCK_TESTS + 4);
});

test('between devices results are combined, the latest passage result wins, and a reset clears older ones', () => {
  const phone = recordPassage(
    recordMockTest(defaultState(), { level: 5, correct: 1, total: 30, at: NOW }),
    'my-day',
    1,
    3,
    NOW + 5,
  );
  const laptop = recordPassage(
    recordMockTest(defaultState(), { level: 4, correct: 2, total: 30, at: NOW + 1 }),
    'my-day',
    3,
    3,
    NOW + 9,
  );
  const merged = mergeStates(phone, 'phone', laptop, 'laptop');
  assert.deepEqual(
    merged.mockTests.map(result => result.level),
    [4, 5],
  );
  assert.equal(merged.passages['my-day']?.correct, 3);
  assert.deepEqual(mergeStates(merged, 'phone', phone, 'laptop').mockTests.length, 2);
  assert.equal(mergeStates(laptop, 'laptop', phone, 'phone').passages['my-day']?.correct, 3);

  const reset = resetProgress(phone, NOW + 20);
  assert.deepEqual(reset.mockTests, []);
  const afterReset = mergeStates(reset, 'phone', laptop, 'laptop');
  assert.deepEqual(afterReset.mockTests, []);
  assert.deepEqual(afterReset.passages, {});
});

test('passages are well formed: readings in kana, a meaning per paragraph, a right answer per question', () => {
  const ids = PASSAGES.map(passage => passage.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const level of [5, 4, 3, 2, 1])
    assert.ok(
      PASSAGES.some(passage => passage.level === level),
      `N${level}`,
    );
  for (const passage of PASSAGES) {
    assert.match(passage.id, /^[a-z0-9-]+$/);
    assert.ok(passage.english && passage.questions.length >= 3, passage.id);
    for (const [markup, english] of [...passage.paragraphs, [passage.title, passage.english]] as [string, string][]) {
      assert.ok(english, markup);
      const spoken = readingOf(parseSentence(markup)).replace(/[、。「」\s]/g, '');
      assert.ok(isKanaText(spoken), `${passage.id}: ${spoken}`);
    }
    for (const question of passage.questions) {
      assert.ok(question.options.length >= 3, question.question);
      assert.ok(question.answer >= 0 && question.answer < question.options.length, question.question);
      assert.equal(new Set(question.options).size, question.options.length, question.question);
    }
    // Right answers don't always sit in the same place.
    assert.ok(new Set(passage.questions.map(question => question.answer)).size > 1, passage.id);
  }
});
