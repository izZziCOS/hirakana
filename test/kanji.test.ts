import assert from 'node:assert/strict';
import test from 'node:test';
import { answerOf, buildChoices, isCorrectAnswer, meaningKey } from '../src/choices.ts';
import { GROUPS } from '../src/data.ts';
import {
  getKana,
  hasReadingStage,
  isKanji,
  KANA,
  KANJI_ROW_SIZE,
  kanaForAnswer,
  kanjiOfWord,
  kunreiSpelling,
  mainReading,
  readingRomaji,
  ROW_INFO,
  supportsDirection,
  toRomaji,
  wordsWithKanji,
} from '../src/kana.ts';
import { mixUpOf } from '../src/mistakes.ts';
import {
  applyKanjiStage,
  DAY,
  intervalFor,
  KANJI_ONLY_BOX,
  knowsKanjiOf,
  MASTERED_BOX,
  pickNext,
  slowThreshold,
} from '../src/schedule.ts';
import {
  activePool,
  emptyMessage,
  feedbackNote,
  newSession,
  rowsPool,
  showCard,
  submitAnswer,
} from '../src/session.ts';
import { defaultState, migrateState, recordAnswer, updateSettings } from '../src/state.ts';
import type { Stat } from '../src/types.ts';
import { toMarkup } from '../src/ui/html.ts';
import { renderInfo } from '../src/ui/info.ts';
import { placeholderFor, promptLabel, promptMarkup, readingSummary, resultMessage } from '../src/ui/practice/card.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const firstChoice = () => 0;
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const kanjiIn = (group: string) => KANA.filter(item => item.group === group);

test('every JLPT level has its full kanji list, split into rows', () => {
  assert.deepEqual(
    ['k5', 'k4', 'k3', 'k2', 'k1'].map(group => kanjiIn(group).length),
    [79, 166, 367, 367, 1232],
  );
  ROW_INFO.filter(row => row.group.startsWith('k')).forEach(row => {
    const items = KANA.filter(item => item.rowId === row.id);
    assert.ok(items.length > 0 && items.length <= KANJI_ROW_SIZE, row.id);
    assert.ok(row.preview.kanji, row.id);
  });
});

test('every kanji has readings, typeable answers and meanings', () => {
  KANA.filter(isKanji).forEach(item => {
    assert.equal(Array.from(item.kana).length, 1, item.kana);
    assert.ok(item.meanings?.length && item.strokes, item.kana);
    assert.ok(item.accepted.includes(item.romaji), item.kana);
    item.accepted.forEach(answer => assert.match(answer, /^[a-zāīūēō]+$/, `${item.kana}: ${answer}`));
  });
  GROUPS.filter(group => group.id.startsWith('k')).forEach(group =>
    assert.equal(getKana(group.hint).group, group.id, group.hint),
  );
});

test('toRomaji handles small tsu, combinations and long vowels', () => {
  assert.equal(toRomaji('きって'), 'kitte');
  assert.equal(toRomaji('まっちゃ'), 'matcha');
  assert.equal(toRomaji('しゅう'), 'shū');
  assert.equal(toRomaji('こおり'), 'kōri');
  assert.equal(toRomaji('ぢゅう'), 'jū');
  assert.equal(toRomaji('にゅ'), 'nyu');
  assert.equal(readingRomaji('おも.う'), 'omou', 'no long vowel across okurigana');
  assert.equal(kunreiSpelling('shūchū'), 'syūtyū');
});

test('any reading of a kanji is accepted, in full or as the kanji’s own part', () => {
  const up = getKana('上');
  ['jō', 'jou', 'zyou', 'ue', 'agaru', 'a', 'noboru'].forEach(answer =>
    assert.ok(up.accepted.includes(answer), answer),
  );
  assert.ok(isCorrectAnswer(getKana('水'), 'read', 'mizu'));
  assert.ok(!isCorrectAnswer(getKana('水'), 'read', 'yama'));
  assert.equal(kanaForAnswer('mizu', 'kanji'), null, 'kanji readings are too shared to name a mix-up');
});

test('kanji are practised by reading or meaning only', () => {
  const water = getKana('水');
  assert.ok(supportsDirection(water, 'read'));
  assert.ok(supportsDirection(water, 'meaning'));
  assert.ok(!supportsDirection(water, 'recall'));
  assert.ok(!supportsDirection(water, 'match'));
  assert.ok(!supportsDirection(getKana('あ'), 'meaning'));
  assert.ok(!supportsDirection(getKana('やま'), 'meaning'));
});

test('meanings are matched loosely', () => {
  const eat = getKana('食');
  assert.equal(answerOf(eat, 'meaning'), eat.meanings?.[0]);
  assert.equal(meaningKey('To Eat (food)'), 'eat');
  assert.ok(isCorrectAnswer(getKana('水'), 'meaning', ' water '));
  assert.ok(isCorrectAnswer(getKana('日'), 'meaning', 'the sun'));
  assert.ok(!isCorrectAnswer(getKana('水'), 'meaning', 'fire'));
  assert.ok(!isCorrectAnswer(getKana('水'), 'meaning', '()'));
  assert.ok(!isCorrectAnswer(getKana('水'), 'meaning', null));
});

test('meaning choices are four different meanings with only one correct', () => {
  const water = getKana('水');
  const pool = kanjiIn('k5');
  const choices = buildChoices(water, { direction: 'meaning', pool, drillItems: [getKana('火')], random: firstChoice });
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices).size, 4);
  assert.equal(choices.filter(choice => isCorrectAnswer(water, 'meaning', choice)).length, 1);
});

test('kanji reading choices are other kanji readings', () => {
  const water = getKana('水');
  const choices = buildChoices(water, { pool: [getKana('あ'), ...kanjiIn('k5')], drillItems: [getKana('火')] });
  assert.equal(choices.length, 4);
  assert.equal(choices.filter(choice => water.accepted.includes(choice)).length, 1);
  const kanjiReadings = new Set(kanjiIn('k5').map(item => item.romaji));
  choices.forEach(choice => assert.ok(kanjiReadings.has(choice), choice));
});

test('meaning answers get the extra time words get', () => {
  assert.equal(slowThreshold(getKana('水'), 'type', 'meaning'), 9000);
  assert.equal(slowThreshold(getKana('水'), 'type', 'meaning', 2000), 6000);
});

test('kanji rows are practised whatever script is picked', () => {
  const kanjiRow = getKana('水').rowId;
  const state = updateSettings(defaultState(), { script: 'katakana', rows: [kanjiRow], direction: 'meaning' });
  assert.ok(rowsPool(state.settings).some(item => item.kana === '水'));
  assert.ok(activePool(state.settings).length > 0);
  const kanaOnly = updateSettings(state, { rows: ['basic:Vowels'] });
  assert.equal(emptyMessage(kanaOnly.settings, null), 'Meaning mode is for kanji. Choose some kanji rows above.');
  const recallKanji = updateSettings(state, { direction: 'recall' });
  assert.match(emptyMessage(recallKanji.settings, null), /kanji in Read or Meaning mode/);
});

test('meaning stats and settings survive a save and reload', () => {
  const state = migrateState({
    version: 5,
    settings: { direction: 'meaning', rows: [getKana('水').rowId] },
    stats: { 'meaning:水': { correct: 1, wrong: 0, streak: 1, box: 2, due: NOW, last: NOW }, 'recall:水': {} },
    mistakes: [{ kana: '水', given: 'fire', at: NOW, direction: 'meaning' }],
  });

  assert.equal(state.settings.direction, 'meaning');
  assert.deepEqual(Object.keys(state.stats), ['meaning:水']);
  const [mistake] = state.mistakes;
  assert.ok(mistake);
  assert.equal(mistake.direction, 'meaning');
  assert.equal(mixUpOf(mistake), null);
});

test('kanji cards explain readings and meanings', () => {
  const water = getKana('水');
  assert.equal(promptLabel(water, 'meaning', 'type'), 'Type the meaning · JLPT N5 kanji');
  assert.equal(promptLabel(water, 'read', 'choose'), 'Kanji · JLPT N5 kanji');
  assert.equal(placeholderFor(water, 'meaning'), 'Type the meaning in English…');
  assert.equal(placeholderFor(water, 'read'), 'Type any reading in romaji…');
  assert.equal(readingSummary(water), 'sui · mizu');
  assert.equal(text(toMarkup(resultMessage(water, 'read', true, 'mizu'))), 'Correct! 水 reads sui · mizu.');
  assert.equal(
    text(toMarkup(resultMessage(water, 'read', false, 'yama'))),
    '水 reads sui · mizu. You answered “yama”.',
  );
  assert.equal(text(toMarkup(resultMessage(water, 'meaning', true, 'water'))), 'Correct! 水 means “Water”.');
  assert.equal(
    text(toMarkup(resultMessage(water, 'meaning', false, 'fire'))),
    '水 means “Water”. You answered “fire”.',
  );
  assert.equal(text(toMarkup(resultMessage(water, 'meaning', false, null))), '水 means “Water”.');
});

test('the kanji info panel shows readings, strokes and words that use it', () => {
  const info = text(toMarkup(renderInfo(getKana('上'), defaultState(), NOW)));
  assert.match(info, /On reading ジョウ jō · ショウ shō/);
  assert.match(info, /Kun reading うえ ue/);
  assert.match(info, /あがる agaru/);
  assert.match(info, /Kanji · 3 strokes/);
  assert.match(info, /Stroke order/);
  const days = text(toMarkup(renderInfo(getKana('曜'), defaultState(), NOW)));
  assert.match(days, /Used in 日曜日 にちようび Sunday/);
  assert.doesNotMatch(text(toMarkup(renderInfo(getKana('あ'), defaultState(), NOW))), /On reading/);
});

test('a mastered JLPT word moves to kanji only and comes back after a miss', () => {
  const head = getKana('あたま');
  let state = defaultState();
  const answer = (outcome: 'correct' | 'wrong' | 'peeked', now: number) => {
    state = recordAnswer(state, { item: head, direction: 'read', outcome, given: 'atama', ms: 1000, now, run: 1 });
    return state.stats['あたま'];
  };
  let now = NOW;
  for (let box = 2; box < MASTERED_BOX; box++) {
    assert.equal(answer('correct', now)?.kanjiOnly, undefined);
    now += 100 * DAY;
  }
  const promoted = answer('correct', now);
  assert.equal(promoted?.kanjiOnly, true);
  assert.equal(promoted.box, KANJI_ONLY_BOX, 'stage 2 starts back in learning');
  assert.equal(promoted.due, now + intervalFor(KANJI_ONLY_BOX));

  now += DAY;
  assert.equal(answer('correct', now)?.kanjiOnly, true, 'stays kanji only while answered right');
  const missed = answer('wrong', now + DAY);
  assert.equal(missed?.kanjiOnly, undefined);
  assert.equal(missed?.box, 1);

  const plain = recordAnswer(defaultState(), {
    item: getKana('やま'),
    direction: 'read',
    outcome: 'correct',
    given: 'yama',
    ms: 1000,
    now,
    run: 1,
  });
  assert.equal(applyKanjiStage({ ...(plain.stats['やま'] as Stat), box: MASTERED_BOX }, 'peeked').kanjiOnly, undefined);
  assert.equal(
    applyKanjiStage({ correct: 9, wrong: 0, streak: 9, box: 4, due: NOW, last: NOW, kanjiOnly: true }, 'peeked')
      .kanjiOnly,
    undefined,
  );
});

test('kanji-only words hide their reading and keep the stage through a reload', () => {
  const head = getKana('あたま');
  assert.equal(text(toMarkup(promptMarkup(head, true))), '頭');
  assert.equal(promptLabel(head, 'read', 'type', true), 'JLPT N5 words · stage 2: kanji only');
  const stats = { あたま: { correct: 5, wrong: 0, streak: 5, box: 2, due: NOW, last: NOW, kanjiOnly: true } };
  const state = migrateState({ version: 5, stats });
  assert.equal(state.stats['あたま']?.kanjiOnly, true);
  assert.match(text(toMarkup(renderInfo(head, state, NOW))), /Stage 2: kanji only/);
  assert.equal(
    migrateState({ version: 5, stats: { あたま: { box: 2, kanjiOnly: 'yes' } } }).stats['あたま']?.kanjiOnly,
    undefined,
  );
});

test('kanji show their main reading until mastered, separately for read and meaning', () => {
  const water = getKana('水');
  assert.equal(mainReading(water), 'スイ', 'on readings in katakana');
  assert.equal(mainReading(getKana('込')), 'こむ', 'kun readings in hiragana, without the dot');
  assert.equal(text(toMarkup(promptMarkup(water))), '水スイ');
  assert.equal(text(toMarkup(promptMarkup(water, true))), '水');
  assert.ok(hasReadingStage(water) && hasReadingStage(getKana('あたま')) && !hasReadingStage(getKana('やま')));

  let state = defaultState();
  let now = NOW;
  for (let i = 0; i < MASTERED_BOX - 1; i++) {
    state = recordAnswer(state, {
      item: water,
      direction: 'meaning',
      outcome: 'correct',
      given: 'water',
      ms: 1000,
      now,
      run: 1,
    });
    now += 100 * DAY;
  }
  assert.equal(state.stats['meaning:水']?.kanjiOnly, true);
  assert.equal(state.stats['水'], undefined, 'reading keeps its own stage');
  state = recordAnswer(state, {
    item: water,
    direction: 'meaning',
    outcome: 'wrong',
    given: 'fire',
    ms: 1000,
    now,
    run: 0,
  });
  assert.equal(state.stats['meaning:水']?.kanjiOnly, undefined);
});

test('answers report when a word or kanji changes stage', () => {
  const water = getKana('水');
  const mastered = { correct: 4, wrong: 0, streak: 4, box: MASTERED_BOX - 1, due: NOW, last: NOW };
  const state = migrateState({ version: 5, stats: { 水: mastered } });
  const session = showCard(newSession(), { status: 'card', item: water, kind: 'review', choices: [] }, 0, true);
  const promoted = submitAnswer(state, session, 'sui', { now: NOW, clock: 1000 });
  assert.ok(promoted);
  assert.equal(promoted.stageChange, 'kanjiOnly');
  assert.match(
    feedbackNote({ ...promoted, nextReview: 'in 10 min' }),
    /^Next review in 10 min\. Mastered .* kanji only\.$/,
  );

  const back = submitAnswer(promoted.state, session, 'yama', { now: NOW + DAY, clock: 1000 });
  assert.ok(back);
  assert.equal(back.stageChange, 'readingBack');
  assert.match(feedbackNote({ ...back, nextReview: 'in 1 min' }), /reading is shown again/);
  assert.equal(submitAnswer(state, session, 'yama', { now: NOW, clock: 1000 })?.stageChange, null);
});

test('kanji and words point at each other', () => {
  const sunday = getKana('にちようび');
  assert.deepEqual(
    kanjiOfWord(sunday).map(item => item.kana),
    ['日', '曜'],
  );
  assert.deepEqual(kanjiOfWord(getKana('やま')), []);
  const day = wordsWithKanji(getKana('日')).map(item => item.kana);
  assert.ok(day.includes('にちようび') && day.includes('まいにち'));

  const wordInfo = text(toMarkup(renderInfo(sunday, defaultState(), NOW)));
  assert.match(wordInfo, /Kanji 日 ニチ Day Not seen · 曜 ヨウ Weekday Not seen/);
  const kanjiInfo = toMarkup(renderInfo(getKana('日'), defaultState(), NOW));
  assert.match(kanjiInfo, /data-open="にちようび"/);
  assert.match(kanjiInfo, /data-drill="日"/);
});

test('new words whose kanji you know come first', () => {
  const learned = { correct: 2, wrong: 0, streak: 2, box: 2, due: NOW + DAY, last: NOW };
  const pool = [getKana('いま'), getKana('かお')];
  assert.equal(pickNext({ pool, stats: {}, now: NOW })?.item.kana, 'いま');
  assert.ok(!knowsKanjiOf(getKana('かお'), {}));
  assert.ok(knowsKanjiOf(getKana('かお'), { 顔: learned }));
  assert.ok(!knowsKanjiOf(getKana('やま'), { 顔: learned }), 'words without kanji never jump ahead');
  assert.equal(pickNext({ pool, stats: { 顔: learned }, now: NOW })?.item.kana, 'かお');
});
