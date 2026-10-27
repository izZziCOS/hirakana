import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { findKana, getKana, isWord, KANA, kanjiSharingParts, statKey } from '../src/kana.ts';
import { milestonesOf, READABLE_STEPS, recallRate } from '../src/milestones.ts';
import { canReadKana, readableWords } from '../src/reading.ts';
import { intervalFor, MASTERED_BOX } from '../src/schedule.ts';
import {
  chooseNext,
  finishIntro,
  MAX_FOLLOW_UPS,
  mixedDirections,
  newSession,
  practiceEntries,
  queueContrast,
  showCard,
  startDrill,
  submitAnswer,
} from '../src/session.ts';
import { defaultState, updateSettings } from '../src/state.ts';
import type { Card, Direction, Stat, State } from '../src/types.ts';
import { renderInfo } from '../src/ui/info.ts';
import { toMarkup } from '../src/ui/html.ts';
import { codePoints } from '../src/util.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const first = () => 0;
const known = (box = 2): Stat => ({ correct: 3, wrong: 0, streak: 3, box, due: NOW + 3_600_000, last: NOW - 1000 });
const withStats = (state: State, keys: string[], stat: Stat = known()): State => ({
  ...state,
  stats: { ...state.stats, ...Object.fromEntries(keys.map(key => [key, stat])) },
});
const vowels = (direction: State['settings']['direction'] = 'read') =>
  updateSettings(defaultState(), { rows: ['basic:Vowels'], direction }, NOW);

function cardFor(kana: string, direction: Direction = 'read', changes: Partial<Card> = {}): Card {
  return {
    item: getKana(kana),
    kind: 'review',
    direction,
    intro: false,
    choices: [],
    answered: false,
    revealed: false,
    untimed: true,
    shownAt: 0,
    outcome: null,
    given: null,
    ...changes,
  };
}

test('a character seen for the first time is introduced, and the introduction counts as learning it', () => {
  const state = vowels();
  const step = chooseNext(state, newSession(), { now: NOW, random: first });
  assert.equal(step.status, 'card');
  assert.ok(step.intro && step.kind === 'new');
  const session = showCard(newSession(), step, 0);
  const learned = finishIntro(state, session, NOW);
  assert.ok(learned);
  const stat = learned.state.stats[statKey(getKana('あ'))];
  assert.equal(stat?.box, 1);
  assert.equal(stat.due, NOW + intervalFor(1));
  assert.equal(stat.wrong, 0);
  assert.equal(learned.state.mistakes.length, 0);
  assert.equal(learned.session.card?.answered, true);
  assert.equal(finishIntro(learned.state, learned.session, NOW), null);
  assert.equal(finishIntro(state, showCard(newSession(), { ...step, intro: false }, 0), NOW), null);

  // Seen in any direction, it is no longer introduced.
  const seen = withStats(vowels('recall'), ['あ']);
  const recall = chooseNext(seen, newSession(), { now: NOW, random: first });
  assert.ok(recall.status === 'card' && recall.item.kana === 'あ' && !recall.intro);
  const drill = chooseNext(state, startDrill(newSession(), { label: 'x', items: [getKana('い')] }), { now: NOW });
  const off = chooseNext(updateSettings(state, { introduce: false }), newSession(), { now: NOW, random: first });
  assert.ok(off.status === 'card' && off.kind === 'new' && !off.intro);
  assert.ok(drill.status === 'card' && !drill.intro);
});

test('mixed practice reads first and adds the other directions already in use', () => {
  const fresh = vowels('mixed');
  assert.deepEqual(mixedDirections(fresh.stats), ['read']);
  const used = withStats(fresh, ['recall:か', 'listen:か', 'write:か'], known());
  assert.deepEqual(mixedDirections(used.stats), ['read', 'recall', 'listen', 'write']);
  assert.deepEqual(mixedDirections(used.stats, false), ['read', 'recall', 'write']);
  assert.equal(practiceEntries(used).length, 5 * 4);

  // Recall for あ waits until あ can be read; reading い is introduced instead.
  const readingA = withStats(used, ['あ'], known(1));
  const next = chooseNext(
    { ...readingA, stats: { ...readingA.stats, あ: { ...known(1), due: NOW + 60_000 } } },
    newSession(),
    {
      now: NOW,
      random: first,
    },
  );
  assert.ok(next.status === 'card' && next.direction === 'read' && next.item.kana === 'い');

  const canRead = withStats(used, ['あ', 'い', 'う', 'え', 'お'], known(2));
  const recall = chooseNext(canRead, newSession(), { now: NOW, random: first });
  assert.ok(recall.status === 'card' && recall.direction !== 'read' && recall.kind === 'new' && !recall.intro);
});

test('mixed cards are answered in their own direction', () => {
  const state = withStats(vowels('mixed'), ['recall:あ'], { ...known(), due: NOW - 1 });
  const session = { ...newSession(), card: cardFor('あ', 'recall') };
  const right = submitAnswer(state, session, 'あ', { now: NOW, clock: 1000 });
  assert.equal(right?.isCorrect, true);
  assert.equal(right.state.stats['recall:あ']?.correct, 4);
  const wrong = submitAnswer(state, session, 'a', { now: NOW, clock: 1000 });
  assert.equal(wrong?.isCorrect, false);
});

test('a mix-up brings both characters back within the next cards', () => {
  const state = updateSettings(defaultState(), { script: 'katakana', rows: ['basic:S-row', 'basic:T-row'] }, NOW);
  const session = { ...newSession(), card: cardFor('シ') };
  const result = submitAnswer(state, session, 'tsu', { now: NOW, clock: 1000 });
  assert.ok(result);
  assert.deepEqual(
    result.session.followUps.map(entry => entry.item.kana),
    ['ツ', 'シ'],
  );

  const step = chooseNext(result.state, result.session, { now: NOW, random: first });
  assert.ok(step.status === 'card' && step.kind === 'contrast' && step.item.kana === 'ツ');
  const shown = showCard(result.session, step, 0);
  assert.deepEqual(
    shown.followUps.map(entry => entry.item.kana),
    ['シ'],
  );
  // The character just shown is never shown twice in a row.
  const again = chooseNext(result.state, { ...shown, card: cardFor('シ') }, { now: NOW, random: first });
  assert.ok(again.status === 'card' && again.kind !== 'contrast');

  const right = submitAnswer(state, session, 'shi', { now: NOW, clock: 1000 });
  assert.deepEqual(right?.session.followUps, []);
  const drilling = { ...startDrill(session, { label: 'x', items: [getKana('シ')] }) };
  assert.deepEqual(submitAnswer(state, drilling, 'tsu', { now: NOW, clock: 1000 })?.session.followUps, []);

  let queue = queueContrast([], cardFor('シ'), 'tsu', NOW);
  queue = queueContrast(queue, cardFor('ソ'), 'n', NOW);
  queue = queueContrast(queue, cardFor('シ'), 'tsu', NOW);
  assert.ok(queue.length <= MAX_FOLLOW_UPS);
  assert.deepEqual(queueContrast(queue, cardFor('シ'), null, NOW), queue);
});

test('words count as readable once every kana in them is known', () => {
  const word = KANA.find(
    item => isWord(item) && item.group === 'words' && /^[ぁ-ゖ]+$/.test(item.kana) && !/[ゃゅょっー]/.test(item.kana),
  );
  assert.ok(word);
  const chars = codePoints(word.kana);
  const almost = chars.slice(1).map(char => char);
  assert.equal(canReadKana(word.kana, withStats(defaultState(), almost).stats), false);
  const stats = withStats(defaultState(), chars).stats;
  assert.equal(canReadKana(word.kana, stats), true);
  assert.ok(readableWords(stats).some(entry => entry.item === word));
  assert.equal(canReadKana(word.kana, withStats(defaultState(), chars, known(1)).stats), false);

  assert.equal(canReadKana('きゃ', withStats(defaultState(), ['きゃ']).stats), true);
  assert.equal(canReadKana('きって', withStats(defaultState(), ['き', 'て']).stats), false);
  assert.equal(canReadKana('きって', withStats(defaultState(), ['き', 'て', 'きって']).stats), true);
  assert.equal(canReadKana('ゃ', withStats(defaultState(), ['や']).stats), false);
});

test('words show their kanji once those kanji are known, and unpractised words come first', () => {
  const word = KANA.find(item => isWord(item) && item.kanji && !/[ゃゅょっー]/.test(item.kana));
  assert.ok(word?.kanji);
  const kana = codePoints(word.kana);
  const kanji = codePoints(word.kanji).filter(char => findKana(char)?.script === 'kanji');
  const reading = withStats(defaultState(), kana).stats;
  assert.equal(readableWords(reading).find(entry => entry.item === word)?.inKanji, false);
  const both = withStats(defaultState(), [...kana, ...kanji, word.kana]).stats;
  const words = readableWords(both);
  assert.equal(words.find(entry => entry.item === word)?.inKanji, true);
  // Practised words go after the ones not practised yet.
  assert.equal(words.at(-1)?.item, word);
});

test('recall rates need enough answers', () => {
  const items = ['あ', 'い'].map(getKana);
  assert.equal(recallRate({ あ: known() }, items, 'read'), null);
  const stat = (correct: number, wrong: number): Stat => ({ ...known(), correct, wrong });
  assert.equal(recallRate({ あ: stat(9, 1), い: stat(8, 2) }, items, 'read'), 85);
});

test('milestones mark a whole set mastered and new numbers of readable words', () => {
  const vowelsMastered = Object.fromEntries(
    KANA.filter(item => item.group === 'basic').map(item => [item.kana, known(MASTERED_BOX)]),
  );
  const before = { ...vowelsMastered, あ: known(MASTERED_BOX - 1) };
  const notes = milestonesOf(before, vowelsMastered, getKana('あ'), 'read');
  assert.ok(notes.some(note => note.includes('every card in') && note.includes('mastered')));

  // Learning the basic kana one by one, some step passes a number of readable words.
  let stats: Record<string, Stat> = {};
  let crossed: string[] = [];
  for (const item of KANA.filter(candidate => candidate.group === 'basic' && candidate.script === 'hiragana')) {
    const next = { ...stats, [item.kana]: known() };
    const found = milestonesOf(stats, next, item, 'read').filter(note => note.includes('read'));
    stats = next;
    if (found.length) {
      crossed = found;
      break;
    }
  }
  assert.match(crossed[0] ?? '', /^Milestone: you can now read \d+ words\.$/);
  assert.deepEqual(milestonesOf(vowelsMastered, vowelsMastered, getKana('あ'), 'read'), []);
  assert.deepEqual(milestonesOf(before, vowelsMastered, getKana('あ'), 'recall'), []);
  assert.ok(READABLE_STEPS.includes(10));
});

test('kanji show the parts they are built from and the kanji that share them', () => {
  const word = getKana('語');
  assert.deepEqual(word.parts, [
    { shape: '言', kanji: '言' },
    { shape: '吾', kanji: '吾' },
  ]);
  assert.deepEqual(getKana('海').parts?.[0], { shape: '氵', kanji: '水' });
  const related = kanjiSharingParts(word, 8).map(item => item.kana);
  assert.ok(related.includes('話') && related.includes('読'));
  assert.ok(!related.includes('語'));
  assert.ok(kanjiSharingParts(getKana('言'), 50).some(item => item.kana === '語'));
  const info = toMarkup(renderInfo(word, defaultState(), NOW));
  assert.ok(info.includes('Parts') && info.includes('Same parts in'));
  assert.ok(info.includes('data-open="言"'));
});
