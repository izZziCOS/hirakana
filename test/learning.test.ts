import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { recordingOf } from '../src/audio.ts';
import { RECORDINGS } from '../src/audio-data.ts';
import '../src/kanji.ts';
import { findKana, getKana, isWord, KANA, kanjiSharingParts, statKey } from '../src/kana.ts';
import { milestonesOf, READABLE_STEPS, recallRate } from '../src/milestones.ts';
import { canReadKana, readableWords } from '../src/reading.ts';
import { DAY, HOUR, intervalFor, MASTERED_BOX, SIBLING_GAP } from '../src/schedule.ts';
import {
  chooseNext,
  finishIntro,
  MAX_FOLLOW_UPS,
  mixedDirections,
  newSession,
  NO_VOICE_MESSAGE,
  practiceEntries,
  queueContrast,
  showCard,
  startDrill,
  submitAnswer,
  todaySummary,
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
  assert.deepEqual(mixedDirections(fresh.stats), ['read', 'cloze']);
  const used = withStats(fresh, ['recall:か', 'listen:か', 'write:か'], known());
  assert.deepEqual(mixedDirections(used.stats), ['read', 'recall', 'listen', 'write', 'cloze']);
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

  const canRead = withStats(used, ['あ', 'い', 'う', 'え', 'お'], { ...known(2), last: NOW - SIBLING_GAP });
  const recall = chooseNext(canRead, newSession(), { now: NOW, random: first });
  assert.ok(recall.status === 'card' && recall.direction !== 'read' && recall.kind === 'new' && !recall.intro);
});

const reviewDue = (last: number): Stat => ({ correct: 3, wrong: 0, streak: 3, box: 6, due: NOW - 1, last });

test('in mixed practice a review waits while another direction of the word was answered recently', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels'], direction: 'mixed' }, NOW);
  const longAgo = NOW - 7 * DAY;
  const stats = { あ: reviewDue(NOW - 60_000), 'recall:あ': reviewDue(longAgo), 'recall:い': reviewDue(longAgo) };
  const step = chooseNext({ ...state, stats }, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card');
  assert.equal(step.item.kana, 'あ', 'the longest overdue of those free to come up is reading あ, its own direction');
  assert.equal(step.direction, 'read');

  // Reading あ answered a minute ago holds recalling あ back, whatever else is due.
  const answered = {
    あ: { ...reviewDue(NOW - 60_000), due: NOW + DAY },
    'recall:あ': reviewDue(longAgo),
    'recall:い': reviewDue(longAgo),
  };
  const next = chooseNext({ ...state, stats: answered }, newSession(), { now: NOW, random: first });
  assert.ok(next.status === 'card');
  assert.equal(next.item.kana, 'い');
  assert.equal(next.direction, 'recall');

  // The wait ends.
  const later = NOW + SIBLING_GAP;
  const freed = chooseNext(
    { ...state, stats: { ...answered, 'recall:い': { ...reviewDue(longAgo), due: later + DAY } } },
    newSession(),
    { now: later, random: first },
  );
  assert.ok(freed.status === 'card');
  assert.equal(freed.item.kana, 'あ');
  assert.equal(freed.direction, 'recall');
});

test('the day’s numbers leave out reviews waiting for another direction', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels'], direction: 'mixed' }, NOW);
  const longAgo = NOW - 7 * DAY;
  const stats = {
    あ: { ...reviewDue(NOW - 60_000), due: NOW + DAY },
    'recall:あ': reviewDue(longAgo),
    'recall:い': reviewDue(longAgo),
  };
  assert.equal(todaySummary({ ...state, stats }, newSession(), NOW).due, 1);
  assert.equal(todaySummary({ ...state, stats }, newSession(), NOW + SIBLING_GAP).due, 2);
});

test('a new direction of a word waits too, once the word can be read', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels'], direction: 'mixed' }, NOW);
  const used = { 'recall:か': known() };
  const fresh = { あ: { ...known(2), last: NOW - 60_000, due: NOW + DAY } };
  const step = chooseNext({ ...state, stats: { ...used, ...fresh } }, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card');
  assert.equal(step.item.kana, 'い', 'recalling あ waits, so reading the next kana is introduced');
});

test('cards still being learned aren’t held back for long, but stay apart when anything else is due', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels'], direction: 'mixed' }, NOW);
  const learning = (last: number): Stat => ({ correct: 1, wrong: 1, streak: 0, box: 1, due: NOW - 1, last });
  const recent = NOW - 60_000;
  const both = {
    あ: { ...learning(recent), due: NOW + 60_000 },
    'recall:あ': learning(NOW - HOUR),
    'recall:い': { ...learning(NOW - HOUR), due: NOW - 1 },
  };
  const apart = chooseNext({ ...state, stats: both }, newSession(), { now: NOW, random: first });
  assert.ok(apart.status === 'card');
  assert.equal(apart.item.kana, 'い');
  const only = { あ: { ...learning(recent), due: NOW + 60_000 }, 'recall:あ': learning(NOW - HOUR) };
  const alone = chooseNext({ ...state, stats: only }, newSession(), { now: NOW, random: first, voice: true });
  assert.ok(alone.status === 'card');
  assert.equal(alone.direction, 'recall');
  assert.equal(alone.item.kana, 'あ');
});

test('practising one direction on its own isn’t held back by the others', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels'], direction: 'recall' }, NOW);
  const stats = { あ: { ...reviewDue(NOW - 60_000), due: NOW + DAY }, 'recall:あ': reviewDue(NOW - 7 * DAY) };
  const step = chooseNext({ ...state, stats }, newSession(), { now: NOW, random: first });
  assert.ok(step.status === 'card');
  assert.equal(step.item.kana, 'あ');
  assert.equal(todaySummary({ ...state, stats }, newSession(), NOW).due, 1);
});

test('extra practice can still reach cards waiting for another direction when nothing else is left', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels'], direction: 'mixed' }, NOW);
  const held: Record<string, Stat> = Object.fromEntries(
    ['あ', 'い', 'う', 'え', 'お'].flatMap(kana => [
      [kana, { ...reviewDue(NOW - 60_000), due: NOW + DAY }],
      [`recall:${kana}`, reviewDue(NOW - 7 * DAY)],
    ]),
  );
  assert.equal(chooseNext({ ...state, stats: held }, newSession(), { now: NOW, random: first }).status, 'done');
  const extra = chooseNext({ ...state, stats: held }, { ...newSession(), extra: true }, { now: NOW, random: first });
  assert.ok(extra.status === 'card' && extra.kind === 'ahead');
});

test('without a voice only cards with a recording can be listened to', () => {
  const state = updateSettings(defaultState(), { rows: ['basic:Vowels', 'yoon:KY'], direction: 'listen' }, NOW);
  const withVoice = practiceEntries(state, true).map(entry => entry.item.kana);
  const withoutVoice = practiceEntries(state, false).map(entry => entry.item.kana);
  assert.ok(withVoice.includes('きゃ'), 'a combination has no recording');
  assert.ok(!withoutVoice.includes('きゃ'));
  assert.ok(withoutVoice.includes('あ'));

  const noRecordings = updateSettings(defaultState(), { rows: ['yoon:KY'], direction: 'listen' }, NOW);
  assert.deepEqual(chooseNext(noRecordings, newSession(), { now: NOW, voice: false }), {
    status: 'empty',
    message: NO_VOICE_MESSAGE,
  });
  assert.equal(chooseNext(noRecordings, newSession(), { now: NOW, voice: true }).status, 'card');

  const mixed = withStats(
    updateSettings(defaultState(), { rows: ['basic:Vowels', 'yoon:KY'], direction: 'mixed' }, NOW),
    ['listen:か'],
  );
  const heard = practiceEntries(mixed, false).filter(entry => entry.direction === 'listen');
  assert.ok(heard.length > 0 && heard.every(entry => recordingOf(entry.item)));

  const drill = startDrill(newSession(), { label: 'Sounds', items: [getKana('きゃ'), getKana('あ')] });
  const drilled = chooseNext(noRecordings, drill, { now: NOW, voice: false, random: first });
  assert.ok(drilled.status === 'card' && drilled.item.kana === 'あ');
});

test('recordings match their cards and exist', () => {
  assert.equal(recordingOf(getKana('あ')), recordingOf(getKana('ア')), 'both scripts share a sound');
  assert.notEqual(recordingOf(getKana('あ')), recordingOf(getKana('い')));
  assert.notEqual(recordingOf(getKana('はし')), recordingOf(getKana('はし/箸')), 'homophones keep their own');
  assert.equal(recordingOf(getKana('水')), undefined);
  assert.equal(recordingOf({ ...getKana('あ'), id: 'toString' }), undefined);
  for (const [id, stem] of Object.entries(RECORDINGS)) {
    assert.ok(findKana(id), id);
    assert.ok(existsSync(join(import.meta.dirname, '..', 'vendor', 'audio', `${stem}.mp3`)), stem);
  }
  const sources = readFileSync(join(import.meta.dirname, '..', 'vendor', 'audio', 'SOURCES.tsv'), 'utf8');
  for (const stem of new Set(Object.values(RECORDINGS))) assert.ok(sources.includes(`${stem}.mp3\t`), stem);
  assert.equal(
    sources
      .trim()
      .split('\n')
      .slice(1)
      .every(line => /\t(CC0|CC BY 4\.0|CC BY-SA 4\.0)\t/.test(line)),
    true,
  );
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
