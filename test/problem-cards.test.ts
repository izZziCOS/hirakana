import assert from 'node:assert/strict';
import test from 'node:test';
import { getKana, statKey } from '../src/kana.ts';
import { mergeStates } from '../src/merge.ts';
import { problemCards } from '../src/mistakes.ts';
import { DAY, LEECH_MISSES } from '../src/schedule.ts';
import { chooseNext, newSession, practiceEntries, startDrill, todaySummary } from '../src/session.ts';
import {
  addDeck,
  defaultState,
  deleteDeck,
  isKnown,
  isSuspended,
  KNOWN_BOX,
  markKnown,
  migrateState,
  recordAnswer,
  resetProgress,
  setSuspended,
  updateDeck,
  updateSettings,
} from '../src/state.ts';
import { registerDecks } from '../src/decks.ts';
import type { Stat, State } from '../src/types.ts';
import { toMarkup } from '../src/ui/html.ts';
import { renderInfo } from '../src/ui/info.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const first = () => 0;
const vowels = (changes: Partial<State['settings']> = {}) =>
  updateSettings(defaultState(), { rows: ['basic:Vowels'], ...changes }, NOW);
const dueStat: Stat = { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW - 1, last: NOW - DAY };

test('a suspended card is left out of practice, the day’s numbers and the mix-ups that follow', () => {
  const state = setSuspended(vowels(), 'あ', true, NOW);
  assert.ok(isSuspended(state, 'あ'));
  assert.ok(!isSuspended(state, 'い'));
  assert.ok(practiceEntries(vowels()).some(entry => entry.item.id === 'あ'));
  assert.ok(!practiceEntries(state).some(entry => entry.item.id === 'あ'));

  const step = chooseNext(state, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.item.id === 'い');

  const withDue = { ...state, stats: { あ: dueStat, い: dueStat } };
  assert.equal(todaySummary(withDue, newSession(), NOW).due, 1);

  const contrast = { ...newSession(), followUps: [{ item: getKana('あ'), direction: 'read' as const }] };
  const next = chooseNext(state, contrast, { now: NOW, random: first });
  assert.ok(next.status === 'card' && next.item.id !== 'あ' && next.kind !== 'contrast');

  const resumed = setSuspended(state, 'あ', false, NOW + 1);
  assert.ok(!isSuspended(resumed, 'あ'));
  assert.ok(practiceEntries(resumed).some(entry => entry.item.id === 'あ'));
});

test('a drill can still practise a suspended card, since it was picked by hand', () => {
  const state = setSuspended(vowels(), 'あ', true, NOW);
  const session = startDrill(newSession(), { label: 'あ', items: [getKana('あ')] });
  const step = chooseNext(state, session, { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.item.id === 'あ' && step.kind === 'drill');
});

test('practice says so when every card picked is suspended', () => {
  const state = ['あ', 'い', 'う', 'え', 'お'].reduce((all, id) => setSuspended(all, id, true, NOW), vowels());
  const step = chooseNext(state, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'empty' && step.message.includes('suspended'));
  // Nothing suspended: the usual explanation stays.
  const kana = chooseNext(vowels({ direction: 'cloze' }), newSession(), { now: NOW, random: first });
  assert.ok(kana.status === 'empty' && kana.message.includes('grammar'));
});

test('suspensions survive a save, and those of cards that don’t exist are dropped', () => {
  const saved = JSON.parse(JSON.stringify(setSuspended(defaultState(), 'あ', true, NOW))) as Record<string, unknown>;
  const loaded = migrateState({
    ...saved,
    suspensions: { ...(saved.suspensions as object), nope: { on: true, at: 1 } },
  });
  assert.deepEqual(loaded.suspensions, { あ: { on: true, at: NOW } });
  assert.deepEqual(migrateState({ version: 8, suspensions: { あ: 'yes', い: { on: 1, at: -5 } } }).suspensions, {
    い: { on: false, at: 0 },
  });
  assert.deepEqual(migrateState({ version: 8 }).suspensions, {});
});

test('between devices the latest choice for a card wins, and a reset clears older ones', () => {
  const phone = setSuspended(setSuspended(defaultState(), 'あ', true, NOW), 'い', true, NOW + 5);
  const laptop = setSuspended(setSuspended(defaultState(), 'あ', false, NOW + 10), 'い', false, NOW + 1);
  const merged = mergeStates(phone, 'phone', laptop, 'laptop');
  assert.ok(!isSuspended(merged, 'あ'));
  assert.ok(isSuspended(merged, 'い'));
  assert.deepEqual(mergeStates(laptop, 'laptop', phone, 'phone').suspensions, merged.suspensions);

  const reset = resetProgress(phone, NOW + 20);
  assert.deepEqual(reset.suspensions, {});
  assert.deepEqual(mergeStates(reset, 'phone', laptop, 'laptop').suspensions, {});
});

test('suspending a deck’s word goes with the word or the deck', () => {
  const deck = {
    id: 'zoo',
    name: 'Zoo',
    words: [
      { kana: 'ねこ', meaning: 'cat' },
      { kana: 'いぬ', meaning: 'dog' },
    ],
    addedAt: NOW,
    updatedAt: NOW,
  };
  const state = setSuspended(addDeck(defaultState(), deck, NOW), '@zoo/ねこ', true, NOW);
  registerDecks(state.decks);
  assert.ok(isSuspended(migrateState(JSON.parse(JSON.stringify(state))), '@zoo/ねこ'));
  const shorter = updateDeck(state, 'zoo', [{ kana: 'いぬ', meaning: 'dog' }], NOW + 1);
  assert.deepEqual(shorter.suspensions, {});
  assert.deepEqual(deleteDeck(state, 'zoo', NOW + 1).suspensions, {});
  const other = { ...state, decks: [], deletedDecks: { zoo: NOW + 1 } };
  assert.deepEqual(mergeStates(state, 'a', other, 'b').suspensions, {});
  registerDecks([]);
});

test('“I know this” moves a card far along without counting as an answer', () => {
  const item = getKana('あ');
  const state = vowels();
  const known = markKnown(state, item, NOW, () => 0.5);
  const stat = known.stats[statKey(item)] as Stat;
  assert.equal(stat.box, KNOWN_BOX);
  assert.equal(stat.due, NOW + 21 * DAY);
  assert.equal(stat.correct, 0);
  assert.equal(stat.last, NOW);
  assert.deepEqual(known.days, {});
  assert.ok(isKnown(known, item));
  assert.ok(!isKnown(state, item));

  // A card already further along keeps its place.
  const further: Stat = { correct: 9, wrong: 1, streak: 4, box: 9, due: NOW + 90 * DAY, last: NOW };
  const kept = markKnown({ ...state, stats: { あ: further } }, item, NOW);
  assert.deepEqual(kept.stats['あ'], further);
});

test('“I know this” covers the directions in use, not ones mixed practice would then take up', () => {
  const item = getKana('あ');
  const inRead = markKnown(vowels(), item, NOW);
  assert.deepEqual(Object.keys(inRead.stats), ['あ']);
  const inRecall = markKnown(vowels({ direction: 'recall' }), item, NOW);
  assert.deepEqual(Object.keys(inRecall.stats).sort(), ['recall:あ', 'あ'].sort());
  const practised = { ...vowels(), stats: { 'listen:あ': { ...dueStat, avgMs: 900 } } };
  const both = markKnown(practised, item, NOW);
  assert.deepEqual(Object.keys(both.stats).sort(), ['listen:あ', 'あ'].sort());
  assert.equal(both.stats['listen:あ']?.correct, 1);
  assert.equal(both.stats['listen:あ'].avgMs, 900);
});

test('cards that keep being missed are listed, most missed first, once per item', () => {
  const leech = (wrong: number): Stat => ({ correct: 2, wrong, streak: 0, box: 1, due: NOW, last: NOW });
  const state: State = {
    ...defaultState(),
    stats: {
      あ: leech(LEECH_MISSES),
      い: leech(LEECH_MISSES + 3),
      'recall:い': leech(LEECH_MISSES + 1),
      う: leech(1),
      え: leech(LEECH_MISSES),
    },
  };
  const suspended = setSuspended(state, 'え', true, NOW);
  assert.deepEqual(
    problemCards(suspended).map(({ item, wrong }) => [item.id, wrong]),
    [
      ['い', LEECH_MISSES + 3],
      ['あ', LEECH_MISSES],
    ],
  );
});

test('answering a card eight times wrong makes it a problem card, and “I know this” ends that', () => {
  const item = getKana('あ');
  let state = defaultState();
  for (let i = 0; i < LEECH_MISSES; i++) {
    state = recordAnswer(state, {
      item,
      direction: 'read',
      outcome: 'wrong',
      given: 'x',
      ms: 900,
      now: NOW + i,
      run: 0,
    });
  }
  assert.deepEqual(
    problemCards(state).map(({ item: found }) => found.id),
    ['あ'],
  );
  assert.deepEqual(problemCards(markKnown(state, item, NOW + 100)), []);
});

test('the info panel offers to suspend a card, to resume it or to mark it as known', () => {
  const item = getKana('あ');
  const info = toMarkup(renderInfo(item, vowels(), NOW));
  assert.match(info, /data-suspend="あ"[^>]*>\s*Suspend/);
  assert.match(info, /data-known="あ"/);
  const suspended = toMarkup(renderInfo(item, setSuspended(vowels(), 'あ', true, NOW), NOW));
  assert.match(suspended, /Suspended: left out of practice/);
  assert.match(suspended, /data-suspend="あ"[^>]*>\s*Resume/);
  assert.doesNotMatch(suspended, /data-known/);
  assert.doesNotMatch(toMarkup(renderInfo(item, markKnown(vowels(), item, NOW), NOW)), /data-known/);
  assert.match(toMarkup(renderInfo(getKana('~wa-topic/1'), vowels(), NOW)), /data-suspend="~wa-topic\/1"/);
});
