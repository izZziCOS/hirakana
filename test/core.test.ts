import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChoices, isCorrectAnswer, wordVariants } from '../src/choices.ts';
import {
  bestDayStreak,
  calendarWeeks,
  dayKey,
  dayStreak,
  forecast,
  heatLevel,
  heatThresholds,
  logDay,
  weeklyAccuracy,
} from '../src/days.ts';
import { formatSeconds, formatWait } from '../src/format.ts';
import {
  getKana,
  KANA,
  kanaForAnswer,
  longVowelSpellings,
  normalizeAnswer,
  parseStatKey,
  statKey,
  supportsDirection,
} from '../src/kana.ts';
import { confusionPairs, mixUpOf, mixUpsFor, mostMissed } from '../src/mistakes.ts';
import {
  applyAnswer,
  DAY,
  HOUR,
  intervalFor,
  LEARNING_LIMIT,
  levelOf,
  MAX_BOX,
  MINUTE,
  outcomeFor,
  PEEK_PENALTY,
  personalPace,
  pickNext,
  slowThreshold,
  type Stats,
  weightedPick,
} from '../src/schedule.ts';
import type { DayLog, Mistake } from '../src/types.ts';
import { html, toMarkup, trusted } from '../src/ui/html.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const daysAgo = (n: number) => new Date(2026, 0, 10 - n, 12).getTime();
const firstChoice = () => 0;
const vowels = () => ['あ', 'い', 'う', 'え', 'お'].map(getKana);
const stat = (box: number, due: number) => ({ correct: 0, wrong: 0, streak: 0, box, due, last: 0 });
const day = (answers: number, scored = 0, correct = 0): DayLog => ({ answers, learned: 0, scored, correct });
const mistake = (kana: string, given: string, direction: Mistake['direction'] = 'read'): Mistake => ({
  kana,
  given,
  at: NOW,
  direction,
});

test('normalizeAnswer trims, lowercases and folds full-width and half-width input', () => {
  assert.equal(normalizeAnswer('  KA '), 'ka');
  assert.equal(normalizeAnswer('kōhī'), 'kōhī');
  assert.equal(normalizeAnswer('ky a'), 'kya');
  assert.equal(normalizeAnswer('ｶ'), 'カ');
  assert.equal(normalizeAnswer('ＫＡ'), 'ka');
});

test('kanaForAnswer finds the kana a reading belongs to within a script', () => {
  assert.equal(kanaForAnswer('tsu', 'katakana')?.kana, 'ツ');
  assert.equal(kanaForAnswer('tsu', 'hiragana')?.kana, 'つ');
  assert.equal(kanaForAnswer('xyz', 'hiragana'), null);
  assert.equal(kanaForAnswer('', 'hiragana'), null);
});

test('longVowelSpellings covers macrons, doubled vowels and hiragana spellings', () => {
  assert.deepEqual(longVowelSpellings('kyō', 'hiragana'), ['kyō', 'kyoo', 'kyou']);
  assert.deepEqual(longVowelSpellings('kōhī', 'katakana'), ['kōhī', 'kōhii', 'koohī', 'koohii']);
});

test('statKey keeps reading stats under the bare kana and round-trips', () => {
  assert.equal(statKey(getKana('あ'), 'read'), 'あ');
  assert.equal(statKey(getKana('あ'), 'recall'), 'recall:あ');
  assert.deepEqual(parseStatKey('match:あ'), { direction: 'match', kana: 'あ' });
  assert.deepEqual(parseStatKey('あ'), { direction: 'read', kana: 'あ' });
});

test('supportsDirection limits words and loanword katakana', () => {
  assert.ok(supportsDirection(getKana('やま'), 'read'));
  assert.ok(!supportsDirection(getKana('やま'), 'recall'));
  assert.ok(!supportsDirection(getKana('コーヒー'), 'match'));
  assert.ok(supportsDirection(getKana('ファ'), 'recall'));
  assert.ok(!supportsDirection(getKana('ファ'), 'match'));
  assert.ok(supportsDirection(getKana('きゃ'), 'match'));
});

test('slowThreshold allows more time for typing, typing kana, listening and words', () => {
  assert.equal(slowThreshold(getKana('あ'), 'choose'), 4000);
  assert.equal(slowThreshold(getKana('あ'), 'type'), 6000);
  assert.equal(slowThreshold(getKana('あ'), 'type', 'recall'), 8000);
  assert.equal(slowThreshold(getKana('あ'), 'choose', 'listen'), 5000);
  assert.equal(slowThreshold(getKana('やま'), 'type'), 9000);
});

test('slowThreshold adapts to your own pace within limits', () => {
  assert.equal(slowThreshold(getKana('あ'), 'choose', 'read', 1500), 3000);
  assert.equal(slowThreshold(getKana('あ'), 'choose', 'read', 500), 2400);
  assert.equal(slowThreshold(getKana('あ'), 'choose', 'read', 9000), 8000);
  assert.equal(slowThreshold(getKana('やま'), 'type', 'read', 2000), 6000);
});

test('personalPace is the median answer time once there is enough history', () => {
  const timed = (avgMs: number) => ({ correct: 1, wrong: 0, streak: 1, box: 2, due: NOW, last: NOW, avgMs });
  const kana = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け'];
  const stats: Stats = Object.fromEntries(kana.map((k, i) => [k, timed(1000 + i * 100)]));
  assert.equal(personalPace(stats, 'read'), 1400);
  assert.equal(personalPace(stats, 'recall'), null);
  assert.equal(personalPace({ あ: timed(1000) }, 'read'), null);
  assert.equal(personalPace({ ...stats, やま: timed(99_000), ねこ: timed(99_000) }, 'read'), 1400);
});

test('outcomeFor classifies peeks, misses and slow answers', () => {
  const base = { isCorrect: true, revealed: false, ms: 1000, threshold: 6000 };
  assert.equal(outcomeFor(base), 'correct');
  assert.equal(outcomeFor({ ...base, ms: 7000 }), 'slow');
  assert.equal(outcomeFor({ ...base, ms: 7000, threshold: Infinity }), 'correct');
  assert.equal(outcomeFor({ ...base, ms: null }), 'correct');
  assert.equal(outcomeFor({ ...base, isCorrect: false }), 'wrong');
  assert.equal(outcomeFor({ ...base, revealed: true }), 'peeked');
});

test('a new kana answered correctly jumps to box 2', () => {
  const result = applyAnswer(undefined, 'correct', NOW, 1500);
  assert.equal(result.box, 2);
  assert.equal(result.due, NOW + intervalFor(2));
  assert.equal(result.correct, 1);
  assert.equal(result.avgMs, 1500);
});

test('a due kana answered correctly moves up one box', () => {
  const result = applyAnswer({ ...stat(4, NOW - 1), correct: 3, streak: 3 }, 'correct', NOW);
  assert.equal(result.box, 5);
  assert.equal(result.due, NOW + intervalFor(5));
});

test('a slow correct answer counts as right but keeps the box', () => {
  const result = applyAnswer({ ...stat(3, NOW - 1), correct: 3, streak: 3, avgMs: 2000 }, 'slow', NOW, 8000);
  assert.equal(result.box, 3);
  assert.equal(result.correct, 4);
  assert.equal(result.due, NOW + intervalFor(3));
  assert.equal(result.avgMs, 3800);
  assert.equal(applyAnswer(undefined, 'slow', NOW, 8000).box, 1);
});

test('answering early keeps the schedule unchanged', () => {
  const due = NOW + DAY;
  const result = applyAnswer({ ...stat(4, due), correct: 2, streak: 2 }, 'correct', NOW);
  assert.equal(result.box, 4);
  assert.equal(result.due, due);
  assert.equal(result.correct, 3);
});

test('the box never goes past the last interval', () => {
  assert.equal(applyAnswer(stat(MAX_BOX, NOW), 'correct', NOW).box, MAX_BOX);
});

test('a wrong answer drops the kana back to box 1', () => {
  const result = applyAnswer({ ...stat(6, NOW), correct: 5, streak: 5 }, 'wrong', NOW);
  assert.equal(result.box, 1);
  assert.equal(result.wrong, 1);
  assert.equal(result.streak, 0);
  assert.equal(result.due, NOW + MINUTE);
});

test('peeking moves the kana back two boxes without counting as wrong', () => {
  const result = applyAnswer({ ...stat(6, NOW), correct: 6, streak: 6 }, 'peeked', NOW);
  assert.equal(result.box, 6 - PEEK_PENALTY);
  assert.equal(result.due, NOW + intervalFor(result.box));
  assert.equal(result.wrong, 0);
  assert.equal(result.correct, 6);
  assert.equal(applyAnswer(undefined, 'peeked', NOW).box, 1);
});

test('levelOf maps boxes to mastery levels', () => {
  assert.equal(levelOf(undefined), 'new');
  assert.equal(levelOf(stat(1, NOW)), 'weak');
  assert.equal(levelOf(stat(3, NOW)), 'learning');
  assert.equal(levelOf(stat(5, NOW)), 'mastered');
});

test('logDay accumulates per local day', () => {
  let days = logDay({}, NOW, { answers: 1, learned: 1, scored: 1, correct: 1 });
  days = logDay(days, NOW + HOUR, { answers: 1, scored: 1 });
  assert.deepEqual(days, { [dayKey(NOW)]: { answers: 2, learned: 1, scored: 2, correct: 1 } });
});

test('logDay keeps a bounded history', () => {
  let days = {};
  for (let i = 500; i >= 0; i--) days = logDay(days, daysAgo(i), { answers: 1 });
  assert.equal(Object.keys(days).length, 400);
  assert.ok(dayKey(NOW) in days);
});

test('dayStreak counts consecutive practice days', () => {
  const days = Object.fromEntries([0, 1, 2, 4].map(n => [dayKey(daysAgo(n)), day(3)]));
  assert.equal(dayStreak(days, NOW), 3);
  const notYetToday = Object.fromEntries([1, 2].map(n => [dayKey(daysAgo(n)), day(3)]));
  assert.equal(dayStreak(notYetToday, NOW), 2);
  assert.equal(dayStreak({ [dayKey(daysAgo(3))]: day(1) }, NOW), 0);
});

test('bestDayStreak finds the longest run, including across months', () => {
  const keys = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06'];
  assert.equal(bestDayStreak(Object.fromEntries(keys.map(key => [key, day(1)]))), 4);
});

test('forecast buckets reviews by day, folding overdue ones into today', () => {
  const stats: Stats = {
    あ: stat(3, NOW - DAY),
    い: stat(3, NOW + HOUR),
    う: stat(4, NOW + DAY),
    え: stat(6, NOW + 30 * DAY),
    お: stat(0, NOW),
  };
  assert.deepEqual(forecast(stats, Object.keys(stats), NOW, 3), [2, 1, 0]);
});

test('calendarWeeks returns Monday-first weeks ending with the current one', () => {
  const weeks = calendarWeeks(NOW, 3);
  assert.equal(weeks.length, 3);
  assert.ok(weeks.every(week => week.length === 7));
  assert.equal(weeks[2]?.[0], '2026-01-05');
  assert.ok(weeks[2].includes(dayKey(NOW)));
  assert.equal(weeks[0]?.[0], '2025-12-22');
});

test('weeklyAccuracy sums scored answers per week and skips empty weeks', () => {
  const days = { '2026-01-05': day(5, 4, 3), '2026-01-07': day(6, 6, 6), '2025-12-29': day(2, 0, 0) };
  const weeks = weeklyAccuracy(days, NOW, 2);
  assert.deepEqual(weeks[1], { start: '2026-01-05', scored: 10, correct: 9, accuracy: 0.9 });
  assert.equal(weeks[0]?.accuracy, null);
});

test('pickNext prefers the most overdue review', () => {
  const stats: Stats = { あ: stat(3, NOW - 10), い: stat(3, NOW - 1000), う: stat(3, NOW + 1000) };
  const next = pickNext({ pool: vowels(), stats, now: NOW, random: firstChoice });
  assert.equal(next?.kind, 'review');
  assert.equal(next.item.kana, 'い');
});

test('pickNext introduces new kana in chart order', () => {
  const next = pickNext({ pool: vowels(), stats: { あ: stat(2, NOW + 1000) }, now: NOW, random: firstChoice });
  assert.equal(next?.kind, 'new');
  assert.equal(next.item.kana, 'い');
});

test('pickNext stops introducing kana once the daily limit is reached', () => {
  const stats = { あ: stat(2, NOW + 1000) };
  const next = pickNext({ pool: vowels(), stats, now: NOW, allowNew: false, random: firstChoice });
  assert.equal(next?.kind, 'ahead');
  assert.equal(next.item.kana, 'あ');
});

test('pickNext holds back new kana while too many are struggling', () => {
  const pool = KANA.filter(k => k.script === 'hiragana' && k.group === 'basic');
  const stats = Object.fromEntries(pool.slice(0, LEARNING_LIMIT).map(k => [k.kana, stat(1, NOW + 1000)]));
  const next = pickNext({ pool, stats, now: NOW, random: firstChoice });
  assert.equal(next?.kind, 'ahead');
  assert.equal(next.item.kana, pool[0]?.kana);
});

test('pickNext keeps a separate schedule per direction', () => {
  const stats = { あ: stat(3, NOW - 1000), 'recall:い': stat(3, NOW - 1000) };
  assert.equal(pickNext({ pool: vowels(), stats, now: NOW, random: firstChoice })?.item.kana, 'あ');
  assert.equal(
    pickNext({ pool: vowels(), stats, direction: 'recall', now: NOW, random: firstChoice })?.item.kana,
    'い',
  );
});

test('pickNext avoids repeating the current kana and handles an empty pool', () => {
  const stats = { あ: stat(3, NOW - 1000), い: stat(3, NOW - 10) };
  const next = pickNext({ pool: vowels(), stats, currentItem: getKana('あ'), now: NOW, random: firstChoice });
  assert.equal(next?.item.kana, 'い');
  assert.equal(pickNext({ pool: [], stats: {}, now: NOW }), null);
});

test('weightedPick can repeat items in a tiny drill', () => {
  const pair = [getKana('シ'), getKana('ツ')];
  assert.equal(weightedPick(pair, {}, getKana('シ'), { random: firstChoice })?.kana, 'シ');
});

test('read choices are four distinct readings with only one correct', () => {
  ['シ', 'き', 'きゃ', 'ファ', 'コーヒー', 'きって', 'やま', 'ラーメン'].forEach(kana => {
    const target = getKana(kana);
    const choices = buildChoices(target, { pool: KANA.filter(k => k.script === target.script) });
    assert.equal(choices.length, 4, kana);
    assert.equal(new Set(choices).size, 4, kana);
    assert.equal(choices.filter(choice => target.accepted.includes(choice)).length, 1, kana);
  });
});

test('recall choices are kana in the same script with no second correct answer', () => {
  ['シ', 'じ', 'ず', 'ヲ', 'きゃ', 'ヴァ'].forEach(kana => {
    const target = getKana(kana);
    const choices = buildChoices(target, { direction: 'recall', pool: KANA.filter(k => k.script === target.script) });
    assert.equal(choices.length, 4, kana);
    assert.ok(choices.includes(target.kana), kana);
    choices.forEach(choice => {
      const option = getKana(choice);
      assert.equal(option.script, target.script, `${kana}: ${choice}`);
      if (choice !== kana) assert.ok(!option.accepted.includes(target.romaji), `${kana}: ${choice} reads the same`);
    });
  });
});

test('match choices are in the other script and include the counterpart', () => {
  ['あ', 'シ', 'ぢ', 'きょ'].forEach(kana => {
    const target = getKana(kana);
    const choices = buildChoices(target, { direction: 'match', pool: KANA.filter(k => k.script === target.script) });
    assert.equal(choices.length, 4, kana);
    assert.equal(new Set(choices).size, 4, kana);
    assert.ok(target.counterpart && choices.includes(target.counterpart), kana);
    choices.forEach(choice => assert.notEqual(getKana(choice).script, target.script, `${kana}: ${choice}`));
  });
});

test('isCorrectAnswer checks the answer for each direction, including typed kana', () => {
  assert.ok(isCorrectAnswer(getKana('し'), 'read', 'si'));
  assert.ok(isCorrectAnswer(getKana('し'), 'recall', 'し'));
  assert.ok(isCorrectAnswer(getKana('カ'), 'recall', 'ｶ'));
  assert.ok(!isCorrectAnswer(getKana('カ'), 'recall', 'か'));
  assert.ok(!isCorrectAnswer(getKana('し'), 'recall', 'ち'));
  assert.ok(isCorrectAnswer(getKana('し'), 'match', 'シ'));
  assert.ok(!isCorrectAnswer(getKana('し'), 'match', 'ツ'));
  assert.ok(!isCorrectAnswer(getKana('し'), 'read', null));
});

test('word distractors test the small tsu and long vowels', () => {
  assert.ok(wordVariants('kitte').includes('kite'));
  assert.ok(wordVariants('matcha').includes('macha'));
  assert.ok(wordVariants('kōhī').includes('kohi'));
  assert.ok(!wordVariants('kōhī').includes('kōhī'));
});

test('mixUpOf understands every direction', () => {
  const kanaOf = (pair: ReturnType<typeof mixUpOf>) => pair?.map(k => k.kana);
  assert.deepEqual(kanaOf(mixUpOf(mistake('シ', 'tsu'))), ['シ', 'ツ']);
  assert.deepEqual(kanaOf(mixUpOf(mistake('シ', 'ツ', 'recall'))), ['シ', 'ツ']);
  assert.deepEqual(kanaOf(mixUpOf(mistake('あ', 'オ', 'match'))), ['あ', 'お']);
  assert.equal(mixUpOf(mistake('あ', '')), null);
  assert.equal(mixUpOf(mistake('あ', 'かあ', 'recall')), null);
});

test('confusionPairs groups mix-ups in either direction', () => {
  const mistakes = [
    mistake('シ', 'tsu'),
    mistake('シ', 'ツ', 'recall'),
    mistake('ツ', 'shi'),
    mistake('ソ', 'n'),
    mistake('あ', 'qq'),
    mistake('あ', ''),
  ];
  const pairs = confusionPairs(mistakes);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0]?.items.map(k => k.kana).sort(), ['シ', 'ツ']);
  assert.equal(pairs[0].count, 3);
  assert.deepEqual(
    mixUpsFor(getKana('ツ'), mistakes).map(({ other, count }) => [other.kana, count]),
    [['シ', 3]],
  );
});

test('mostMissed counts and ranks mistakes', () => {
  const mistakes = ['あ', 'い', 'あ'].map(kana => mistake(kana, 'x'));
  assert.deepEqual(
    mostMissed(mistakes, 5).map(({ item, count }) => [item.kana, count]),
    [
      ['あ', 2],
      ['い', 1],
    ],
  );
});

test('formatWait and formatSeconds describe durations', () => {
  assert.equal(formatWait(0), 'now');
  assert.equal(formatWait(20 * 1000), 'in 1 min');
  assert.equal(formatWait(3 * HOUR), 'in 3 h');
  assert.equal(formatWait(DAY), 'in 1 day');
  assert.equal(formatWait(7 * DAY), 'in 7 days');
  assert.equal(formatSeconds(2345), '2.3 s');
});

test('heatThresholds scale the activity colours to your own history', () => {
  assert.deepEqual(heatThresholds([]), [1, 2, 3, 4]);
  assert.deepEqual(heatThresholds([0, 0, 0]), [1, 2, 3, 4]);
  assert.deepEqual(heatThresholds(Array.from({ length: 100 }, (_, i) => i + 1)), [1, 26, 51, 76]);
  assert.deepEqual(heatThresholds([5]), [1, 5, 6, 7]);
  const thresholds = heatThresholds([2, 4, 8, 16]);
  assert.equal(heatLevel(0, thresholds), 0);
  assert.equal(heatLevel(1, thresholds), 1);
  assert.equal(heatLevel(16, thresholds), 4);
});

test('the html helper escapes values and keeps trusted fragments', () => {
  const name = '<script>"x"</script>';
  assert.equal(
    toMarkup(html`<b title="${name}">${name}</b>`),
    '<b title="&lt;script&gt;&quot;x&quot;&lt;/script&gt;">&lt;script&gt;&quot;x&quot;&lt;/script&gt;</b>',
  );
  const list = toMarkup(
    html`<ul>
      ${['a', 'b'].map(item => html`<li>${item}</li>`)}
    </ul>`,
  );
  assert.equal(list.replace(/\s+/g, ''), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(toMarkup(html`${false}${null}${undefined}${0}`), '0');
  assert.equal(toMarkup(trusted('<i>ok</i>')), '<i>ok</i>');
});
