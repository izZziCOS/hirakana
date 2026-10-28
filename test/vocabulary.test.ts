import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { buildChoices, isCorrectAnswer } from '../src/choices.ts';
import {
  findKana,
  getKana,
  isWord,
  KANA,
  kanjiOfWord,
  meaningList,
  ROW_INFO,
  supportsDirection,
  toRomaji,
  VOCAB_ROW_SIZE,
  wordRomaji,
} from '../src/kana.ts';
import { readableWords } from '../src/reading.ts';
import { knowsKanjiOf, pickNext } from '../src/schedule.ts';
import { defaultState, migrateState, recordAnswer } from '../src/state.ts';
import { toMarkup } from '../src/ui/html.ts';
import { GROUP_LABEL } from '../src/ui/labels.ts';
import { meaningPromptMarkup, placeholderFor, promptLabel, resultMessage } from '../src/ui/practice/card.ts';
import { VOCAB_DATA } from '../src/vocab-data.ts';

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const LEVEL_GROUPS = ['n5', 'n4', 'n3', 'n2', 'n1'];

test('every item has its own id, and an id never contains the stat key separator', () => {
  const ids = KANA.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.ok(!id.includes(':'), id));
});

test('the full word list adds thousands of words to every JLPT level', () => {
  const counts = LEVEL_GROUPS.map(group => KANA.filter(item => item.group === group).length);
  counts.forEach(count => assert.ok(count > 500, String(counts)));
  assert.ok(KANA.filter(isWord).length > 7000);
});

test('generated words have kana, romaji, a meaning and a kanji spelling only when it has kanji', () => {
  VOCAB_DATA.forEach(([level, kana, kanji, meaning, id]) => {
    const item = getKana(id ?? kana);
    assert.ok([1, 2, 3, 4, 5].includes(level), kana);
    assert.match(kana, /^([ぁ-ゖー]+|[ァ-ヺー]+)$/, kana);
    assert.match(item.romaji, /^[a-zāīūēō]+$/, `${kana} → ${item.romaji}`);
    assert.ok(meaning.trim() && meaning.length <= 48, kana);
    if (kanji) assert.match(kanji, /\p{Script=Han}/u, kana);
    assert.ok(isWord(item));
    assert.ok(supportsDirection(item, 'read') && supportsDirection(item, 'listen'));
    assert.ok(supportsDirection(item, 'meaning') && supportsDirection(item, 'recall'));
    assert.ok(!supportsDirection(item, 'write') && !supportsDirection(item, 'match'));
    assert.ok(item.meanings?.length, kana);
  });
});

test('words that share their kana with another item are saved under their spelling', () => {
  const ids = VOCAB_DATA.filter(entry => entry[4] !== undefined);
  assert.ok(ids.length > 100);
  ids.forEach(([, kana, kanji, , id]) => assert.equal(id, `${kana}/${kanji}`));
  // て the hand and て the kana are different cards.
  assert.equal(findKana('て')?.group, 'basic');
  assert.equal(findKana('て/手')?.meaning, 'hand');
});

test('the generated rows hold 30 words each, per level and script', () => {
  const rows = ROW_INFO.filter(row => /^N\d( katakana)? · /.test(row.label));
  assert.ok(rows.length > 200);
  rows.forEach(row => {
    const items = KANA.filter(item => item.rowId === row.id);
    assert.ok(items.length > 0 && items.length <= VOCAB_ROW_SIZE, row.id);
    assert.equal(new Set(items.map(item => item.script)).size, 1, row.id);
  });
  assert.ok(ROW_INFO.some(row => row.id === 'n5:N5 · 1–30'));
  assert.ok(ROW_INFO.some(row => row.id === 'n3:N3 katakana · 1–30'));
});

test('words leave out the ones already in the hand-written rows', () => {
  const handWritten = KANA.filter(
    item => isWord(item) && !VOCAB_DATA.some(entry => (entry[4] ?? entry[1]) === item.id),
  );
  assert.ok(handWritten.length > 300);
  VOCAB_DATA.forEach(([, kana, kanji]) =>
    assert.ok(!handWritten.some(item => item.kana === kana && (!kanji || !item.kanji || item.kanji === kanji)), kana),
  );
});

test('romaji of generated words handle long vowels, ー and ん before a vowel', () => {
  assert.equal(toRomaji('シャワー'), 'shawā');
  assert.equal(toRomaji('コーヒー'), 'kōhī');
  assert.equal(toRomaji('レクリェーション'), 'rekuryēshon');
  assert.deepEqual(wordRomaji('きんえん'), { romaji: 'kinen', alternatives: ['kinnen'] });
  assert.deepEqual(wordRomaji('ねこ'), { romaji: 'neko', alternatives: [] });
  const shower = getKana('シャワー');
  assert.ok(isCorrectAnswer(shower, 'read', 'shawaa'));
  assert.ok(isCorrectAnswer(shower, 'read', 'shawā'));
  const word = KANA.find(item => item.group === 'n3' && item.kana === 'きんえん');
  if (word) assert.ok(isCorrectAnswer(word, 'read', 'kinnen') && isCorrectAnswer(word, 'read', 'kinen'));
});

test('progress on generated words survives a save and reload', () => {
  const state = migrateState({ version: 7, stats: { あそこ: { box: 3 }, 'listen:て/手': { box: 2 } } });
  assert.equal(state.stats.あそこ?.box, 3);
  assert.equal(state.stats['listen:て/手']?.box, 2);
});

test('new words are picked from the generated rows, those with known kanji first', () => {
  // The first rows hold words without kanji, so this takes the first row with some.
  const first = KANA.find(item => item.rowId.startsWith('n5:N5 · ') && kanjiOfWord(item).length > 0);
  const pool = KANA.filter(item => item.rowId === first?.rowId);
  const withKanji = pool.filter(item => kanjiOfWord(item).length > 0).at(-1);
  assert.ok(withKanji);
  const known = Object.fromEntries(
    kanjiOfWord(withKanji).map(kanji => [kanji.id, { correct: 1, wrong: 0, streak: 1, box: 2, due: 1e15, last: 0 }]),
  );
  const picked = pickNext({ pool, stats: known, now: 0 })?.item;
  assert.ok(picked && knowsKanjiOf(picked, known), picked?.id);
  assert.notEqual(pickNext({ pool, stats: {}, now: 0 })?.item, picked);
});

test('generated words count towards the words the learner can read', () => {
  const learned = { correct: 1, wrong: 0, streak: 1, box: 2, due: 1e15, last: 0 };
  const stats = Object.fromEntries(['あ', 'そ', 'こ'].map(kana => [kana, learned]));
  assert.ok(readableWords(stats).some(({ item }) => item.id === 'あそこ'));
});

test('a word’s meaning is split into the meanings any of which is accepted', () => {
  assert.deepEqual(meaningList('to meet, to see'), ['to meet', 'to see']);
  assert.deepEqual(meaningList('light (in weight, colour); pale'), ['light (in weight, colour)', 'pale']);
  const there = getKana('あそこ');
  assert.ok(isCorrectAnswer(there, 'meaning', 'over there'));
  assert.ok(isCorrectAnswer(there, 'meaning', 'That place'));
  assert.ok(!isCorrectAnswer(there, 'meaning', 'here'));
});

test('a word is recalled from its meaning, typed in kana or romaji or picked from other words', () => {
  const cat = getKana('ねこ');
  assert.ok(isCorrectAnswer(cat, 'recall', 'ねこ'));
  assert.ok(isCorrectAnswer(cat, 'recall', 'neko'));
  assert.ok(isCorrectAnswer(cat, 'recall', ' Neko '));
  assert.ok(!isCorrectAnswer(cat, 'recall', 'いぬ'));
  const choices = buildChoices(cat, { direction: 'recall', random: () => 0.3 });
  assert.equal(new Set(choices).size, 4);
  assert.ok(choices.includes('ねこ'));
  choices.forEach(choice => assert.ok(findKana(choice) === undefined || isWord(getKana(choice)), choice));

  const meanings = buildChoices(cat, { direction: 'meaning', random: () => 0.3 });
  assert.equal(new Set(meanings).size, 4);
  assert.equal(meanings.filter(meaning => isCorrectAnswer(cat, 'meaning', meaning)).length, 1);
});

test('recalling a word doesn’t move it to the kanji-only stage', () => {
  const one = getKana('ひとつ');
  const mastered = { correct: 9, wrong: 0, streak: 9, box: 5, due: 0, last: 0 };
  const state = { ...defaultState(), stats: { 'recall:ひとつ': mastered, 'meaning:ひとつ': mastered } };
  const answer = (direction: 'recall' | 'meaning') =>
    recordAnswer(state, { item: one, direction, outcome: 'correct', given: null, ms: 900, now: 1, run: 1 }).stats[
      `${direction}:ひとつ`
    ];
  assert.equal(answer('recall')?.kanjiOnly, undefined);
  assert.equal(answer('meaning')?.kanjiOnly, true);
});

test('word cards say what to give and explain the answer', () => {
  const mountain = getKana('やま');
  const one = getKana('ひとつ');
  assert.equal(promptLabel(mountain, 'recall', 'type'), `Type the word · ${GROUP_LABEL[mountain.group]}`);
  assert.equal(placeholderFor(mountain, 'recall'), 'Type the word in hiragana or romaji…');
  assert.equal(placeholderFor(getKana('あ'), 'recall'), 'Type it in hiragana…');
  assert.match(text(toMarkup(meaningPromptMarkup(mountain))), /^mountain/);
  assert.equal(
    text(toMarkup(resultMessage(one, 'recall', true, 'hitotsu'))),
    `Correct! “one thing” is 一つ (ひとつ), hitotsu.`,
  );
  assert.match(text(toMarkup(resultMessage(one, 'recall', false, 'かわ'))), /You answered かわ/);
  assert.equal(
    text(toMarkup(resultMessage(one, 'meaning', false, 'river'))),
    '一つ (ひとつ) means “one thing”. You answered “river”.',
  );
});
