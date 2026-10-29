import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey } from '../src/days.ts';
import { getKana, KANA, statKey } from '../src/kana.ts';
import { mergeStates } from '../src/merge.ts';
import { applyAnswer, catchUpPlan, DAY, pickEntry, REVIEW_BOX, spreadReviews } from '../src/schedule.ts';
import {
  affectsPractice,
  backlog,
  CATCH_UP_AT,
  catchUp,
  chooseNext,
  newSession,
  practiceKeys,
  REVIEW_BATCH,
  reviewMore,
  reviewsLeft,
  todaySummary,
} from '../src/session.ts';
import { defaultState, migrateState, recordAnswer, updateSettings } from '../src/state.ts';
import type { Settings, Stat, State } from '../src/types.ts';
import { catchUpCopy } from '../src/ui/home.ts';
import { toMarkup } from '../src/ui/html.ts';
import { doneScreen, sessionBar } from '../src/ui/practice/summary.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const HOUR = 3_600_000;
const first = () => 0;
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const stat = (box: number, due: number): Stat => ({ correct: 3, wrong: 0, streak: 3, box, due, last: NOW - DAY });
const ROWS = ['basic:Vowels', 'basic:K-row', 'basic:S-row'];
const kana = KANA.filter(item => ROWS.includes(item.rowId) && item.script === 'hiragana').map(item => item.kana);
const practising = (settings: Partial<Settings> = {}, stats: Record<string, Stat> = {}): State => ({
  ...updateSettings(defaultState(), { rows: ROWS, ...settings }, NOW),
  stats,
});
// Every card due for review, the first ones weakest (a day's gap) and the rest stronger (three days).
const overdue = (count: number): Record<string, Stat> =>
  Object.fromEntries(
    kana.slice(0, count).map((k, i) => [k, stat(i < 3 ? REVIEW_BOX : REVIEW_BOX + 1, NOW - i * HOUR)]),
  );
const reviewed = (state: State, count: number): State => ({
  ...state,
  days: { [dayKey(NOW)]: { answers: count, learned: 0, reviews: count, scored: count, correct: count } },
});

test('the day log counts answers to reviews that were due, and nothing else', () => {
  const answer = (previous: Stat | undefined) =>
    recordAnswer(
      { ...defaultState(), stats: previous ? { あ: previous } : {} },
      { item: getKana('あ'), direction: 'read', outcome: 'correct', given: 'a', ms: 1000, now: NOW, run: 1 },
    ).days[dayKey(NOW)]?.reviews;
  assert.equal(answer(stat(REVIEW_BOX, NOW - HOUR)), 1);
  assert.equal(answer(stat(REVIEW_BOX + 3, NOW)), 1);
  assert.equal(answer(stat(REVIEW_BOX - 1, NOW - HOUR)), 0, 'still being learned');
  assert.equal(answer(stat(REVIEW_BOX, NOW + HOUR)), 0, 'answered early');
  assert.equal(answer(undefined), 0, 'new');
});

test('without a limit every due review is shown', () => {
  const state = practising({}, overdue(10));
  assert.equal(reviewsLeft(state, newSession(), NOW), Infinity);
  assert.deepEqual(todaySummary(state, newSession(), NOW), { due: 10, newLeft: 5, held: 0 });
});

test('the daily review limit holds back reviews past it, but not cards still being learned', () => {
  const learning = { [kana[14] ?? '']: stat(2, NOW - 1000) };
  const state = reviewed(practising({ reviewsPerDay: 50 }, { ...overdue(10), ...learning }), 45);
  assert.equal(reviewsLeft(state, newSession(), NOW), 5);
  assert.deepEqual(todaySummary(state, newSession(), NOW), { due: 6, newLeft: 4, held: 5 });

  const full = reviewed(state, 50);
  assert.deepEqual(todaySummary(full, newSession(), NOW), { due: 1, newLeft: 4, held: 10 });
  const step = chooseNext(full, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.item.kana === kana[14] && step.kind === 'review');
});

test('once the limit is reached, practice is done for today until more reviews are asked for', () => {
  const state = reviewed(practising({ reviewsPerDay: 50, newPerDay: 5 }, overdue(10)), 50);
  const done = { ...state, days: { [dayKey(NOW)]: { answers: 55, learned: 5, reviews: 50, scored: 55, correct: 55 } } };
  assert.deepEqual(chooseNext(done, newSession(), { now: NOW }), { status: 'done' });
  // Extra practice doesn't sneak the held reviews in either.
  assert.deepEqual(chooseNext(done, { ...newSession(), extra: true }, { now: NOW, random: first }), { status: 'done' });

  const more = reviewMore(newSession());
  assert.equal(more.bonusReviews, REVIEW_BATCH);
  assert.equal(reviewsLeft(done, more, NOW), REVIEW_BATCH);
  const step = chooseNext(done, more, { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.kind === 'review');
});

test('pickEntry leaves held reviews out entirely', () => {
  const stats = overdue(5);
  const entries = kana.slice(0, 5).map(k => ({ item: getKana(k), direction: 'read' as const }));
  assert.equal(pickEntry({ entries, stats, now: NOW, reviewsLeft: false }), null);
  assert.equal(pickEntry({ entries, stats, now: NOW, random: first })?.kind, 'review');
});

test('the done screen and session bar tell about the daily review limit', () => {
  const state = reviewed(practising({ reviewsPerDay: 50 }, overdue(10)), 50);
  const screen = text(toMarkup(doneScreen(state, newSession(), NOW)));
  assert.ok(screen.includes('10 more reviews are due, waiting for tomorrow: you reached your limit of 50 today.'));
  assert.ok(screen.includes('Review 10 more'));
  const bar = text(toMarkup(sessionBar(state, newSession(), NOW)));
  assert.ok(bar.includes('Due 0') && bar.includes('Reviews today 50/50'));
  assert.ok(!text(toMarkup(sessionBar(practising(), newSession(), NOW))).includes('Reviews today'));
  assert.ok(!text(toMarkup(doneScreen(practising(), newSession(), NOW))).includes('Review '));
});

test('catch-up spreads due reviews over the next days, the weakest first', () => {
  const stats = { ...overdue(12), [kana[13] ?? '']: stat(2, NOW - HOUR), [kana[14] ?? '']: stat(6, NOW + DAY) };
  const keys = Object.keys(stats);
  const spread = spreadReviews(stats, keys, NOW);
  const dueOn = (day: number) => keys.filter(key => spread[key]?.due === new Date(2026, 0, 10 + day).getTime());
  // 12 reviews over 5 days: 3 a day. The three weakest stay due today, with their own due times; of the stronger ones,
  // the longest overdue (here the later ones) come first.
  assert.deepEqual(
    kana.slice(0, 3).map(k => spread[k]),
    kana.slice(0, 3).map(k => stats[k]),
  );
  assert.deepEqual(dueOn(1), kana.slice(9, 12));
  assert.deepEqual(dueOn(2), kana.slice(6, 9));
  assert.deepEqual(dueOn(3), kana.slice(3, 6));
  assert.equal(spread[kana[3] ?? '']?.moved, NOW);
  // A card still being learned and one not due yet stay where they were.
  assert.equal(spread[kana[13] ?? ''], stats[kana[13] ?? '']);
  assert.equal(spread[kana[14] ?? ''], stats[kana[14] ?? '']);

  // No more a day than the daily limit, which takes longer.
  const limited = spreadReviews(stats, keys, NOW, { perDay: 2 });
  assert.equal(limited[kana[3] ?? '']?.due, new Date(2026, 0, 15).getTime());
  // What fits in a day isn't moved.
  const small = overdue(3);
  assert.equal(spreadReviews(small, Object.keys(small), NOW, { days: 1 }), small);
});

test('catchUpPlan says how many reviews a day and over how many days', () => {
  assert.deepEqual(catchUpPlan(340), { daily: 68, days: 5 });
  assert.deepEqual(catchUpPlan(340, 50), { daily: 50, days: 7 });
  assert.deepEqual(catchUpPlan(340, 100), { daily: 68, days: 5 });
  assert.deepEqual(catchUpPlan(0), { daily: 0, days: 0 });
});

test('catch-up is offered for a backlog past the daily limit, or past a hundred without one', () => {
  assert.equal(CATCH_UP_AT, 100);
  const few = practising({}, overdue(15));
  assert.equal(backlog(few, NOW), 0);
  assert.equal(backlog(updateSettings(few, { reviewsPerDay: 50 }), NOW), 0);
  // All the basic kana in both scripts, due: more than a limit of 50 but fewer than a hundred.
  const basic = KANA.filter(item => item.group === 'basic');
  const big = updateSettings(
    { ...defaultState(), stats: Object.fromEntries(basic.map(item => [item.id, stat(5, NOW - HOUR)])) },
    { rows: [...new Set(basic.map(item => item.rowId))], script: 'both' },
    NOW,
  );
  assert.ok(basic.length > 50 && basic.length <= 100);
  assert.equal(backlog(big, NOW), 0);
  assert.equal(backlog(updateSettings(big, { reviewsPerDay: 50 }), NOW), basic.length);

  const caughtUp = catchUp(practising({}, overdue(12)), NOW);
  const moved = practiceKeys(caughtUp).filter(key => caughtUp.stats[key]?.moved === NOW);
  assert.equal(moved.length, 9);
});

test('the catch-up offer says what it will do', () => {
  assert.deepEqual(catchUpCopy(340, 0), {
    title: '340 reviews due',
    detail:
      'That’s a lot for one day. Catch up over 5 days instead: about 68 a day, the cards you know least first, while ' +
      'the rest wait for their day. New cards keep their daily limit.',
    action: 'Spread over 5 days',
  });
  assert.equal(catchUpCopy(340, 50).action, 'Spread over 7 days');
});

test('a review catch-up moved passes on through sync, and answering it ends the move', () => {
  const key = statKey(getKana('あ'));
  // Both copies were last answered at the same time; the one catch-up moved since is newer.
  const before = { ...defaultState(), stats: { [key]: stat(5, NOW - HOUR) } };
  const later: Stat = { ...stat(5, NOW + 2 * DAY), moved: NOW };
  const local = { ...before, stats: { [key]: later } };
  assert.deepEqual(mergeStates(before, 'aaaa', local, 'bbbb').stats[key], later);
  assert.deepEqual(mergeStates(local, 'bbbb', before, 'aaaa').stats[key], later);
  assert.equal(applyAnswer(later, 'correct', NOW + 3 * DAY).moved, undefined);
});

test('saves from before the review limit gain it, switched off, and keep moved reviews', () => {
  const state = migrateState({
    version: 7,
    settings: { rows: ['basic:Vowels'], reviewsPerDay: 75 },
    stats: { あ: { ...stat(5, NOW), moved: NOW }, い: { ...stat(5, NOW), moved: -3 } },
    days: { '2026-01-09': { answers: 3, learned: 1, scored: 3, correct: 2 } },
  });
  assert.equal(state.version, 8);
  assert.equal(state.settings.reviewsPerDay, 0);
  assert.equal(state.stats['あ']?.moved, NOW);
  assert.equal(state.stats['い']?.moved, undefined);
  assert.equal(state.days['2026-01-09']?.reviews, 0);
  assert.equal(migrateState({ version: 8, settings: { reviewsPerDay: 200 } }).settings.reviewsPerDay, 200);
  const settings = defaultState().settings;
  assert.ok(affectsPractice(settings, { ...settings, reviewsPerDay: 100 }));
});
