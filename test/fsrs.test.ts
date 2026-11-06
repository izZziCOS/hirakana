import assert from 'node:assert/strict';
import test from 'node:test';
import { afterLapse, afterRecall, AGAIN, firstMemory, GOOD, HARD, retrievability } from '../src/fsrs.ts';
import { mergeStates } from '../src/merge.ts';
import {
  applyAnswer,
  boxForInterval,
  DAY,
  intervalFor,
  isReview,
  LAPSE_BOX,
  levelOf,
  MASTERED_BOX,
  MAX_INTERVAL,
  memoryOf,
  MINUTE,
  REVIEW_BOX,
} from '../src/schedule.ts';
import { defaultState, migrateState, STATE_VERSION } from '../src/state.ts';
import type { Stat } from '../src/types.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const middle = () => 0.5;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-4, `${actual}`);

const review = (changes: Partial<Stat>): Stat => ({
  correct: 10,
  wrong: 0,
  streak: 5,
  box: 6,
  due: NOW,
  last: NOW - 7 * DAY,
  s: 7,
  d: 5,
  ...changes,
});

// Values from the ts-fsrs package, version 6.0.0, with the same default parameters.
test('the memory model gives the same values as the reference implementation', () => {
  for (const [grade, stability, difficulty] of [
    [AGAIN, 0.212, 6.4133],
    [HARD, 1.2931, 5.112171],
    [GOOD, 2.3065, 2.118104],
  ] as const) {
    close(firstMemory(grade).stability, stability);
    close(firstMemory(grade).difficulty, difficulty);
  }
  for (const [days, stability, expected] of [
    [1, 2.3065, 0.946847],
    [10, 10, 0.9],
    [100, 5, 0.627161],
    [365, 30, 0.673914],
  ] as const) {
    close(retrievability(days, stability), expected);
  }
  for (const [difficulty, stability, days, grade, nextStability, nextDifficulty] of [
    [2.1241, 2.3065, 1, HARD, 5.316759, 4.756839],
    [2.1241, 2.3065, 1, GOOD, 7.311919, 2.117204],
    [5, 10, 10, HARD, 23.246875, 6.665995],
    [5, 10, 10, GOOD, 32.026729, 4.990228],
    [8.5, 30, 90, HARD, 57.267738, 8.989458],
    [8.5, 30, 90, GOOD, 75.340435, 8.486728],
    [2, 200, 400, HARD, 580.049735, 4.674456],
    [2, 200, 400, GOOD, 831.941694, 1.993228],
  ] as const) {
    const next = afterRecall({ stability, difficulty }, days, grade);
    close(next.stability, nextStability);
    close(next.difficulty, nextDifficulty);
  }
  for (const [difficulty, stability, days, nextStability, nextDifficulty] of [
    [2.1241, 2.3065, 1, 0.5712, 7.396474],
    [5, 10, 10, 1.391987, 8.341762],
    [8.5, 30, 90, 2.611853, 9.492189],
    [2, 200, 400, 5.557033, 7.355683],
  ] as const) {
    const next = afterLapse({ stability, difficulty }, days);
    close(next.stability, nextStability);
    close(next.difficulty, nextDifficulty);
  }
});

test('the same right answer gives a hard card a shorter gap than an easy one', () => {
  const easy = applyAnswer(review({ d: 2 }), 'correct', NOW, null, middle);
  const hard = applyAnswer(review({ d: 9 }), 'correct', NOW, null, middle);
  assert.ok(hard.due - NOW < easy.due - NOW);
  assert.ok((hard.s ?? 0) > 7, 'it still grows');
});

test('a right answer after months away grows the gap by far more than one on time', () => {
  const onTime = applyAnswer(review({}), 'correct', NOW, null, middle);
  const overdue = applyAnswer(review({ last: NOW - 180 * DAY }), 'correct', NOW, null, middle);
  assert.ok(overdue.due - NOW > 2 * (onTime.due - NOW));
});

test('a slow right answer grows the gap less, and makes the card count as harder', () => {
  const quick = applyAnswer(review({}), 'correct', NOW, null, middle);
  const slow = applyAnswer(review({}), 'slow', NOW, null, middle);
  assert.ok(slow.due - NOW < quick.due - NOW);
  assert.ok(slow.due - NOW >= 7 * DAY);
  assert.ok((slow.d ?? 0) > (quick.d ?? 0));
});

test('the first review comes a day after the learning steps, and starts the memory from how they went', () => {
  const clean = applyAnswer(
    { ...review({ box: REVIEW_BOX - 1, wrong: 0 }), s: undefined },
    'correct',
    NOW,
    null,
    middle,
  );
  assert.equal(clean.box, REVIEW_BOX);
  assert.equal(clean.due, NOW + DAY);
  assert.equal(clean.s, 2.31);
  const missed = applyAnswer(
    { ...review({ box: REVIEW_BOX - 1, wrong: 1 }), s: undefined },
    'correct',
    NOW,
    null,
    middle,
  );
  assert.equal(missed.due, NOW + DAY);
  assert.ok((missed.d ?? 0) > (clean.d ?? 0));
  assert.ok((missed.s ?? 0) < (clean.s ?? 0));
});

test('a learning step sets no memory, and a slow answer stays on its step', () => {
  const learning = applyAnswer(undefined, 'correct', NOW, 1000);
  assert.equal(learning.s, undefined);
  const slow = applyAnswer(review({ box: 3, s: undefined, d: undefined }), 'slow', NOW);
  assert.equal(slow.box, 3);
  assert.equal(slow.s, undefined);
  assert.equal(slow.due, NOW + intervalFor(3));
});

test('a lapse keeps what the card still remembers and returns to that gap after the steps', () => {
  const known = review({ box: 10, s: 240, last: NOW - 240 * DAY });
  const missed = applyAnswer(known, 'wrong', NOW);
  assert.equal(missed.box, LAPSE_BOX);
  assert.equal(missed.due, NOW + MINUTE);
  assert.ok((missed.s ?? 0) < 240 && (missed.s ?? 0) > 1);
  assert.ok((missed.d ?? 0) > 5);

  // Another miss during the steps is part of the same lapse.
  const again = applyAnswer(missed, 'wrong', NOW + MINUTE);
  assert.equal(again.s, missed.s);

  const back = applyAnswer(missed, 'correct', NOW + MINUTE, null, middle);
  assert.ok(isReview(back));
  assert.equal(back.s, missed.s);
  assert.equal(back.due, NOW + MINUTE + Math.round((missed.s ?? 0) * DAY));
});

test('a peek at a review counts as not remembering, without counting as wrong', () => {
  const peeked = applyAnswer(review({}), 'peeked', NOW);
  assert.equal(peeked.wrong, 0);
  assert.ok((peeked.s ?? 0) < 7);
});

test('extra practice before a card is due leaves its memory alone', () => {
  const early = review({ due: NOW + DAY });
  const practised = applyAnswer(early, 'correct', NOW);
  assert.equal(practised.s, 7);
  assert.equal(practised.due, NOW + DAY);
});

test('gaps stop at a year, and the step follows the gap', () => {
  const longKnown = review({ box: 10, s: 900, last: NOW - 900 * DAY });
  const next = applyAnswer(longKnown, 'correct', NOW, null, middle);
  assert.equal(next.due, NOW + MAX_INTERVAL);
  assert.equal(next.box, 10);
  assert.equal(boxForInterval(DAY), REVIEW_BOX);
  assert.equal(boxForInterval(3 * DAY), MASTERED_BOX);
  assert.equal(boxForInterval(20 * DAY), 6);
  assert.equal(boxForInterval(21 * DAY), 7);
  assert.equal(levelOf(applyAnswer(review({}), 'correct', NOW, null, middle)), 'mastered');
});

test('saved progress gains a memory from its gap and its misses, and nothing else changes', () => {
  const stats = {
    あ: { correct: 9, wrong: 1, streak: 3, box: 7, due: NOW + DAY, last: NOW - 20 * DAY, avgMs: 900 },
    い: { correct: 2, wrong: 8, streak: 0, box: 5, due: NOW, last: NOW - 3 * DAY },
    う: { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW, last: NOW - 1000 },
  };
  const state = migrateState({ version: 10, stats });
  assert.equal(state.version, STATE_VERSION);
  assert.deepEqual(state.stats['あ'], { ...stats['あ'], s: 21, d: 3.52 });
  assert.equal(state.stats['い']?.s, 3);
  assert.equal(state.stats['い'].d, 10);
  assert.deepEqual(state.stats['う'], stats['う'], 'still being learned');
  assert.deepEqual(migrateState(state), state, 'upgrading again changes nothing');
});

test('a saved memory is kept, and a broken one worked out again', () => {
  const stat = { correct: 3, wrong: 0, streak: 3, box: 6, due: NOW, last: NOW - DAY };
  const kept = migrateState({ version: 11, stats: { あ: { ...stat, s: 12.5, d: 4.2 } } });
  assert.equal(kept.stats['あ']?.s, 12.5);
  assert.equal(kept.stats['あ'].d, 4.2);
  const broken = migrateState({ version: 11, stats: { あ: { ...stat, s: 'x', d: -1 } } });
  assert.equal(broken.stats['あ']?.s, 7);
  const excessive = migrateState({ version: 11, stats: { あ: { ...stat, s: 5, d: 90 } } });
  assert.equal(excessive.stats['あ']?.d, 10);
});

test('memoryOf keeps a card’s saved memory', () => {
  assert.deepEqual(memoryOf(review({ s: 3, d: 8 })), { stability: 3, difficulty: 8 });
  assert.equal(memoryOf({ box: 4, correct: 0, wrong: 0 }).stability, 1);
});

test('syncing keeps the memory of a card’s most recent review', () => {
  const older = review({ last: NOW - DAY, s: 7, d: 5 });
  const newer = review({ last: NOW, s: 30, d: 3 });
  const mine = { ...defaultState(), stats: { あ: older } };
  const theirs = { ...defaultState(), stats: { あ: newer } };
  assert.deepEqual(mergeStates(mine, 'a', theirs, 'b').stats['あ'], newer);
  assert.deepEqual(mergeStates(theirs, 'a', mine, 'b').stats['あ'], newer);
});
