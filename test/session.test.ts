import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey } from '../src/days.ts';
import { getKana } from '../src/kana.ts';
import { intervalFor, MAX_TIMED_MS } from '../src/schedule.ts';
import {
  answerTiming,
  chooseNext,
  effectiveMode,
  emptyMessage,
  endDrill,
  feedbackNote,
  learnMore,
  markUntimed,
  NEW_BATCH,
  newSession,
  practiseExtra,
  resetCard,
  revealCard,
  showCard,
  startDrill,
  submitAnswer,
} from '../src/session.ts';
import { defaultState, updateSettings } from '../src/state.ts';
import type { Card, Session, Settings, State, Stat } from '../src/types.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const firstChoice = () => 0;
const stat = (box: number, due: number): Stat => ({ correct: 1, wrong: 0, streak: 1, box, due, last: NOW });
const withSettings = (changes: Partial<Settings>, state: State = defaultState()) => updateSettings(state, changes);
const vowelsOnly = (changes: Partial<Settings> = {}) => withSettings({ rows: ['basic:Vowels'], ...changes });
const VOWELS = ['あ', 'い', 'う', 'え', 'お'];

function cardFor(kana: string, changes: Partial<Card> = {}): Card {
  return {
    item: getKana(kana),
    kind: 'new',
    direction: 'read',
    intro: false,
    choices: [],
    answered: false,
    revealed: false,
    untimed: false,
    shownAt: 0,
    outcome: null,
    given: null,
    ...changes,
  };
}

const withCard = (card: Card, session: Session = newSession()): Session => ({ ...session, card });

test('effectiveMode forces multiple choice only for matching', () => {
  const settings = defaultState().settings;
  assert.equal(effectiveMode({ ...settings, direction: 'recall', mode: 'type' }), 'type');
  assert.equal(effectiveMode({ ...settings, direction: 'match', mode: 'type' }), 'choose');
});

test('chooseNext shows a new card with choices in multiple-choice mode', () => {
  const step = chooseNext(vowelsOnly({ mode: 'choose' }), newSession(), { now: NOW, random: firstChoice });
  assert.equal(step.status, 'card');
  assert.equal(step.kind, 'new');
  assert.equal(step.item.kana, 'あ');
  assert.equal(step.choices.length, 4);
});

test('chooseNext avoids repeating the card on screen', () => {
  const state: State = { ...vowelsOnly(), stats: { あ: stat(3, NOW - 1000), い: stat(3, NOW - 10) } };
  const step = chooseNext(state, withCard(cardFor('あ')), { now: NOW, random: firstChoice });
  assert.equal(step.status === 'card' && step.item.kana, 'い');
});

test('chooseNext is done for today once nothing is due and the new limit is used', () => {
  const learned: State = {
    ...vowelsOnly({ newPerDay: 5 }),
    stats: Object.fromEntries(VOWELS.map(kana => [kana, stat(2, NOW + 600_000)])),
    days: { [dayKey(NOW)]: { answers: 5, learned: 5, scored: 5, correct: 5 } },
  };
  assert.equal(chooseNext(learned, newSession(), { now: NOW }).status, 'done');
  assert.equal(chooseNext(learned, practiseExtra(newSession()), { now: NOW }).status, 'card');
});

test('chooseNext keeps going while a character is still at the first step', () => {
  const state: State = {
    ...vowelsOnly(),
    stats: Object.fromEntries(VOWELS.map((kana, i) => [kana, stat(i ? 2 : 1, NOW + 60_000)])),
  };
  assert.equal(chooseNext(state, newSession(), { now: NOW, random: firstChoice }).status, 'card');
});

test('learnMore raises the daily new limit for the session', () => {
  const state: State = {
    ...withSettings({ rows: ['basic:Vowels', 'basic:K-row'], newPerDay: 5 }),
    stats: Object.fromEntries(VOWELS.map(kana => [kana, stat(2, NOW + 600_000)])),
    days: { [dayKey(NOW)]: { answers: 5, learned: 5, scored: 5, correct: 5 } },
  };
  assert.equal(chooseNext(state, newSession(), { now: NOW }).status, 'done');
  const more = learnMore(newSession());
  assert.equal(more.bonusNew, NEW_BATCH);
  const step = chooseNext(state, more, { now: NOW });
  assert.equal(step.status === 'card' && step.kind, 'new');
});

test('chooseNext explains why nothing can be practised', () => {
  const hiraganaLoanwords = withSettings({ script: 'hiragana', rows: ['extended:F'] });
  const empty = chooseNext(hiraganaLoanwords, newSession(), { now: NOW });
  assert.match(empty.status === 'empty' ? empty.message : '', /exist in hiragana/);

  const wordsInWrite = withSettings({ rows: ['words:Food'], direction: 'write' });
  const step = chooseNext(wordsInWrite, newSession(), { now: NOW });
  assert.equal(step.status === 'empty' && step.message, emptyMessage(wordsInWrite.settings, null));
  assert.match(emptyMessage(withSettings({ direction: 'match' }).settings, null), /both scripts/);
});

test('chooseNext drills only the drilled characters, and endDrill stops it', () => {
  const session = startDrill(newSession(), { label: 'シ ⇄ ツ', items: [getKana('シ'), getKana('ツ')] });
  for (let i = 0; i < 10; i++) {
    const step = chooseNext(defaultState(), session, { now: NOW });
    assert.ok(step.status === 'card' && step.kind === 'drill' && ['シ', 'ツ'].includes(step.item.kana));
  }
  assert.equal(endDrill(session).drill, null);
  const plain = newSession();
  assert.equal(endDrill(plain), plain);
  const wordDrill = startDrill(newSession(), { label: 'words', items: [getKana('やま')] });
  assert.equal(chooseNext(withSettings({ direction: 'write' }), wordDrill, { now: NOW }).status, 'empty');
});

test('showCard puts the next card into the session, or clears it', () => {
  const step = chooseNext(vowelsOnly(), newSession(), { now: NOW });
  const session = showCard(newSession(), step, 1234, true);
  assert.equal(session.card?.item.kana, 'あ');
  assert.equal(session.card.shownAt, 1234);
  assert.equal(session.card.untimed, true);
  assert.equal(session.card.answered, false);
  assert.equal(showCard(session, { status: 'done' }, 0).card, null);
});

test('revealCard and markUntimed only change an unanswered card', () => {
  const open = withCard(cardFor('あ'));
  assert.equal(revealCard(open).card?.revealed, true);
  assert.equal(markUntimed(open).card?.untimed, true);
  const revealed = revealCard(open);
  assert.equal(revealCard(revealed), revealed);
  const answered = withCard(cardFor('あ', { answered: true }));
  assert.equal(revealCard(answered), answered);
  assert.equal(revealCard(newSession()).card, null);
});

test('answerTiming ignores untimed cards and long pauses', () => {
  assert.equal(answerTiming(cardFor('あ', { shownAt: 1000 }), 3500), 2500);
  assert.equal(answerTiming(cardFor('あ', { shownAt: 1000, untimed: true }), 3500), null);
  assert.equal(answerTiming(cardFor('あ', { shownAt: 0 }), MAX_TIMED_MS + 1), null);
});

test('submitAnswer scores the card and updates both the session and saved state', () => {
  const state = vowelsOnly();
  const result = submitAnswer(state, withCard(cardFor('あ', { shownAt: 0 })), 'a', { now: NOW, clock: 1500 });
  assert.ok(result);
  assert.equal(result.outcome, 'correct');
  assert.equal(result.isCorrect, true);
  assert.equal(result.wasNew, true);
  assert.equal(result.ms, 1500);
  assert.equal(result.session.card?.answered, true);
  assert.deepEqual([result.session.answered, result.session.correct, result.session.streak], [1, 1, 1]);
  assert.equal(result.state.stats['あ']?.due, NOW + intervalFor(2));
  assert.equal(result.state.bestStreak, 1);
  assert.equal(submitAnswer(result.state, result.session, 'a', { now: NOW, clock: 2000 }), null);
});

test('submitAnswer records slow, wrong and peeked answers differently', () => {
  const state = vowelsOnly();
  const slow = submitAnswer(state, withCard(cardFor('あ')), 'a', { now: NOW, clock: 7000 });
  assert.equal(slow?.outcome, 'slow');

  const wrong = submitAnswer(state, withCard(cardFor('あ')), 'o', { now: NOW, clock: 1000 });
  assert.equal(wrong?.outcome, 'wrong');
  assert.equal(wrong.session.streak, 0);
  assert.equal(wrong.state.mistakes[0]?.given, 'o');

  const peeked = submitAnswer(state, withCard(cardFor('あ', { revealed: true })), 'a', { now: NOW, clock: 1000 });
  assert.equal(peeked?.outcome, 'peeked');
  assert.equal(peeked.session.answered, 0);
  assert.equal(peeked.state.mistakes.length, 0);

  assert.equal(submitAnswer(state, newSession(), 'a', { now: NOW, clock: 0 }), null);
});

test('feedbackNote explains what happened to the schedule', () => {
  assert.equal(
    feedbackNote({ outcome: 'correct', ms: 1500, wasNew: false, nextReview: 'in 1 h' }),
    'Next review in 1 h · 1.5 s',
  );
  assert.equal(
    feedbackNote({ outcome: 'correct', ms: null, wasNew: false, nextReview: 'in 1 h' }),
    'Next review in 1 h',
  );
  assert.match(
    feedbackNote({ outcome: 'slow', ms: 9000, wasNew: false, nextReview: 'in 1 h' }),
    /stays at its current step/,
  );
  assert.doesNotMatch(feedbackNote({ outcome: 'slow', ms: 9000, wasNew: true, nextReview: 'in 1 min' }), /stays/);
  assert.match(feedbackNote({ outcome: 'peeked', ms: null, wasNew: true, nextReview: 'in 1 min' }), /peeked/);
});

test('resetCard clears the card so a settings change can show it again', () => {
  const session = withCard(cardFor('あ'));
  assert.equal(resetCard(session).card, null);
  const empty = newSession();
  assert.equal(resetCard(empty), empty);
  const step = chooseNext(vowelsOnly(), resetCard(session), { now: NOW, random: firstChoice });
  assert.equal(step.status === 'card' && step.item.kana, 'あ');
});
