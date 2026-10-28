import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChoices, isCorrectAnswer } from '../src/choices.ts';
import {
  deckChanges,
  deckItems,
  deckNameOf,
  deckOfItem,
  deckRowId,
  MAX_DECKS,
  parseDeck,
  registerDecks,
  sameDecks,
  sanitizeDecks,
  shortMeaning,
} from '../src/decks.ts';
import { findKana, getKana, isWord, KANA, ROW_INFO, statKey, supportsDirection } from '../src/kana.ts';
import { mergeStates } from '../src/merge.ts';
import { chooseNext, newSession, practiceEntries, rowsPool } from '../src/session.ts';
import {
  addDeck,
  defaultState,
  deleteDeck,
  migrateState,
  recordAnswer,
  resetProgress,
  updateDeck,
} from '../src/state.ts';
import type { Deck, State } from '../src/types.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();

const deck = (id: string, words: Deck['words'], name = `Deck ${id}`): Deck => ({
  id,
  name,
  words,
  addedAt: NOW,
  updatedAt: NOW,
});
const animals = deck('zoo', [
  { kana: 'ねこ', kanji: '猫', meaning: 'cat' },
  { kana: 'いぬ', kanji: '犬', meaning: 'dog' },
  { kana: 'パンダ', meaning: 'panda' },
]);

const answer = (state: State, id: string, outcome: 'correct' | 'wrong' = 'correct', now = NOW) =>
  recordAnswer(state, { item: getKana(id), direction: 'read', outcome, given: 'x', ms: 1000, now, run: 1 });

test('a CSV word list with a header row, quotes and alternative spellings is read', () => {
  const { words, skipped } = parseDeck(
    [
      'expression,reading,meaning,tags',
      '会う,あう,"to meet, to see",JLPT',
      'いい; よい,いい; よい,good,JLPT',
      '明るい,あかるい,bright (in reference to personality or weather); cheerful,JLPT',
      '',
      '会う,あう,to meet,duplicate',
    ].join('\n'),
  );
  assert.deepEqual(words, [
    { kana: 'あう', kanji: '会う', meaning: 'to meet, to see' },
    { kana: 'いい', meaning: 'good' },
    { kana: 'あかるい', kanji: '明るい', meaning: 'bright (in reference to personality or weather)' },
  ]);
  assert.equal(skipped, 1, 'the header has no kana word');
});

test('an Anki plain-text export with HTML, furigana and a romaji column is read', () => {
  const text = [
    '#separator:tab',
    '#html:true',
    '#tags column:4',
    '猫[ねこ]\tneko\t<b>cat</b>&nbsp;[sound:neko.mp3]\tanimals',
    '食[た]べる\ttaberu\tto eat<br>to live on',
    'コーヒー\tkōhī\tcoffee',
    '学生\tがくせい\tgakusei\tstudent',
    '\t\t',
    'just some text\twith no Japanese',
  ].join('\r\n');
  const { words, skipped } = parseDeck(String.fromCharCode(0xfeff) + text);
  assert.deepEqual(words, [
    { kana: 'ねこ', kanji: '猫', meaning: 'cat' },
    { kana: 'たべる', kanji: '食べる', meaning: 'to eat, to live on' },
    { kana: 'コーヒー', meaning: 'coffee' },
    { kana: 'がくせい', kanji: '学生', meaning: 'student' },
  ]);
  assert.equal(skipped, 1);
});

test('semicolon-separated lists and fields in any order work too', () => {
  assert.deepEqual(parseDeck('water;水;みず\nfire;火;ひ').words, [
    { kana: 'みず', kanji: '水', meaning: 'water' },
    { kana: 'ひ', kanji: '火', meaning: 'fire' },
  ]);
  assert.deepEqual(parseDeck('nothing to see here\n123,456').words, []);
});

test('long meanings are cut down at a comma and lose their notes only when they have to', () => {
  assert.equal(shortMeaning('always, usually, every time, never (with neg. verb)', 40), 'always, usually, every time');
  assert.equal(
    shortMeaning('late afternoon (typically just before dinner time), evening', 30),
    'late afternoon, evening',
  );
  assert.equal(shortMeaning('(abbr.) kilo'), 'kilo');
  assert.equal(shortMeaning('(sigh)'), '(sigh)');
  assert.equal(shortMeaning('a'.repeat(10) + ' ' + 'b'.repeat(30), 20), 'aaaaaaaaaa…');
});

test('deck names come from the file name', () => {
  assert.equal(deckNameOf('Genki_Lesson 3.txt'), 'Genki Lesson 3');
  assert.equal(deckNameOf('.csv'), 'Imported deck');
});

test('deck words become word cards, saved under the deck', () => {
  const [neko, inu, panda] = deckItems(animals);
  assert.ok(neko && inu && panda);
  assert.equal(neko.id, '@zoo/ねこ/猫');
  assert.equal(panda.id, '@zoo/パンダ');
  assert.equal(deckOfItem(neko.id), 'zoo');
  assert.equal(deckOfItem('ねこ'), null);
  assert.equal(panda.script, 'katakana');
  assert.equal(neko.rowId, deckRowId(animals));
  assert.ok(isWord(neko) && supportsDirection(neko, 'listen') && supportsDirection(neko, 'meaning'));
  assert.ok(supportsDirection(neko, 'recall') && !supportsDirection(neko, 'write'));
  assert.ok(isCorrectAnswer(neko, 'read', 'neko'));
  assert.ok(isCorrectAnswer(panda, 'read', 'panda'));
});

test('registered decks join the item lists and leave them again', () => {
  const before = KANA.length;
  registerDecks([animals]);
  assert.equal(KANA.length, before + 3);
  assert.equal(findKana('@zoo/ねこ/猫')?.meaning, 'cat');
  assert.ok(ROW_INFO.some(row => row.id === 'custom:zoo' && row.label === 'Deck zoo'));
  // Decks are practised whatever script is picked.
  const settings = { ...defaultState().settings, rows: ['custom:zoo'] };
  assert.equal(rowsPool(settings).length, 3);
  registerDecks([]);
  assert.equal(KANA.length, before);
  assert.equal(findKana('@zoo/ねこ/猫'), undefined);
  assert.ok(!ROW_INFO.some(row => row.group === 'custom'));
});

test('a small deck still gets four choices', () => {
  const tiny = deck('tiny', [
    { kana: 'みず', meaning: 'water' },
    { kana: 'ひ', meaning: 'fire' },
  ]);
  registerDecks([tiny]);
  const [water] = deckItems(tiny);
  assert.ok(water);
  const item = getKana(water.id);
  assert.equal(new Set(buildChoices(item, { direction: 'read', random: () => 0.5 })).size, 4);
  assert.equal(new Set(buildChoices(item, { direction: 'listen', random: () => 0.5 })).size, 4);
  registerDecks([]);
});

test('adding a deck picks its row, and deleting it removes its cards, mistakes and row', () => {
  registerDecks([animals]);
  let state = addDeck(updateRows(defaultState(), ['basic:Vowels']), animals, NOW);
  assert.deepEqual(state.decks, [animals]);
  assert.deepEqual(state.settings.rows, ['basic:Vowels', 'custom:zoo']);
  state = answer(answer(answer(state, '@zoo/ねこ/猫', 'wrong'), 'あ'), '@zoo/パンダ');
  assert.equal(state.mistakes.length, 1);
  assert.equal(state.mistakes[0]?.kana, '@zoo/ねこ/猫');
  assert.ok(state.stats[statKey(getKana('@zoo/パンダ'))]);

  const deleted = deleteDeck(state, 'zoo', NOW + 1);
  assert.deepEqual(deleted.decks, []);
  assert.deepEqual(deleted.deletedDecks, { zoo: NOW + 1 });
  assert.deepEqual(Object.keys(deleted.stats), ['あ']);
  assert.deepEqual(deleted.mistakes, []);
  assert.deepEqual(deleted.settings.rows, ['basic:Vowels']);
  assert.equal(deleted.settingsChangedAt, NOW + 1);

  // With only the deck picked, the basic kana come back rather than no rows at all.
  const only = addDeck(updateRows(defaultState(), ['basic:Vowels']), animals, NOW);
  const alone = deleteDeck({ ...only, settings: { ...only.settings, rows: ['custom:zoo'] } }, 'zoo');
  assert.deepEqual(alone.settings.rows, defaultState().settings.rows);
  registerDecks([]);
});

test('there is a limit on the number of decks', () => {
  const full = { ...defaultState(), decks: Array.from({ length: MAX_DECKS }, (_, i) => deck(`d${i}`, animals.words)) };
  assert.throws(() => addDeck(full, deck('more', animals.words)), /up to 20 decks/);
});

test('decks and their progress survive a save and reload, and broken decks are dropped', () => {
  registerDecks([animals]);
  const state = answer(addDeck(defaultState(), animals, NOW), '@zoo/ねこ/猫');
  registerDecks([]);
  // The tab that loads it doesn't have the deck registered yet; the saved deck is enough.
  const reloaded = migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reloaded.decks, [animals]);
  assert.ok(reloaded.stats['@zoo/ねこ/猫']);
  assert.ok(reloaded.settings.rows.includes('custom:zoo'));

  const orphaned = migrateState({ ...JSON.parse(JSON.stringify(state)), decks: [] });
  assert.deepEqual(orphaned.stats, {});
  assert.ok(!orphaned.settings.rows.includes('custom:zoo'));

  assert.deepEqual(
    sanitizeDecks([
      animals,
      animals,
      { id: 'BAD ID', name: 'x', words: animals.words },
      { id: 'empty', name: 'x', words: [{ kana: 'cat', meaning: 'cat' }] },
      { id: 'mixed', name: '  ', words: [{ kana: 'ねこ', kanji: 'cat', meaning: ' cat ' }, 'nonsense'] },
      'nonsense',
    ]),
    [
      animals,
      { id: 'mixed', name: 'Imported deck', words: [{ kana: 'ねこ', meaning: 'cat' }], addedAt: 0, updatedAt: 0 },
    ],
  );
});

test('old saves gain an empty list of decks', () => {
  const state = migrateState({ version: 6, settings: { rows: ['basic:Vowels'] } });
  assert.equal(state.version, 7);
  assert.deepEqual(state.decks, []);
  assert.deepEqual(state.deletedDecks, {});
});

test('resetting progress keeps the decks', () => {
  const state = { ...addDeck(defaultState(), animals, NOW), deletedDecks: { old: NOW } };
  const reset = resetProgress(state, NOW + 1);
  assert.deepEqual(reset.decks, [animals]);
  assert.deepEqual(reset.deletedDecks, { old: NOW });
});

test('syncing joins the decks of two devices and keeps a deleted deck deleted', () => {
  registerDecks([animals]);
  const colours = deck('col', [{ kana: 'あか', meaning: 'red' }]);
  const phone = answer(addDeck(defaultState(), animals, NOW), '@zoo/ねこ/猫');
  const laptop = addDeck(defaultState(), colours, NOW);
  const joined = mergeStates(phone, 'phone', laptop, 'laptop');
  assert.deepEqual(
    joined.decks.map(d => d.id),
    ['zoo', 'col'],
  );

  // The laptop deletes the deck the phone still has, with progress on it.
  const deletedOnLaptop = deleteDeck(mergeStates(laptop, 'laptop', phone, 'phone'), 'zoo', NOW + 5);
  const back = mergeStates(phone, 'phone', deletedOnLaptop, 'laptop');
  assert.deepEqual(
    back.decks.map(d => d.id),
    ['col'],
  );
  assert.equal(back.deletedDecks.zoo, NOW + 5);
  assert.deepEqual(back.stats, {});
  registerDecks([]);
});

function updateRows(state: State, rows: string[]): State {
  return { ...state, settings: { ...state.settings, rows } };
}

test('a new version of a deck keeps progress on the words still in it', () => {
  registerDecks([animals]);
  let state = addDeck(defaultState(), animals, NOW);
  state = answer(answer(state, '@zoo/ねこ/猫', 'wrong'), '@zoo/いぬ/犬');
  const words = [
    { kana: 'ねこ', kanji: '猫', meaning: 'cat, kitty' },
    { kana: 'うま', kanji: '馬', meaning: 'horse' },
  ];
  assert.deepEqual(deckChanges(animals.words, words), { added: 1, removed: 2 });
  const updated = updateDeck(state, 'zoo', words, NOW + 9);
  const [zoo] = updated.decks;
  assert.ok(zoo);
  assert.deepEqual(zoo.words, words);
  assert.equal(zoo.updatedAt, NOW + 9);
  assert.equal(zoo.addedAt, NOW);
  assert.deepEqual(Object.keys(updated.stats), ['@zoo/ねこ/猫']);
  assert.equal(updated.mistakes.length, 1, 'the mistake on ねこ stays');
  assert.equal(updateDeck(state, 'missing', words), state);
  // A new version counts as a change of decks; the same version doesn't.
  assert.ok(!sameDecks(state.decks, updated.decks));
  assert.ok(sameDecks(state.decks, JSON.parse(JSON.stringify(state.decks)) as Deck[]));
  registerDecks([]);
});

test('syncing keeps the newer version of a deck and drops cards of words it left out', () => {
  registerDecks([animals]);
  const phone = answer(answer(addDeck(defaultState(), animals, NOW), '@zoo/いぬ/犬'), '@zoo/ねこ/猫');
  const laptop = updateDeck(phone, 'zoo', [{ kana: 'ねこ', kanji: '猫', meaning: 'cat' }], NOW + 5);
  for (const merged of [mergeStates(phone, 'phone', laptop, 'laptop'), mergeStates(laptop, 'laptop', phone, 'phone')]) {
    assert.equal(merged.decks[0]?.updatedAt, NOW + 5);
    assert.deepEqual(Object.keys(merged.stats), ['@zoo/ねこ/猫']);
  }
  registerDecks([]);
});

test('the words of imported decks are introduced before other new cards, the newest deck first', () => {
  const colours = deck('col', [{ kana: 'あか', kanji: '赤', meaning: 'red' }]);
  registerDecks([animals, colours]);
  const state = addDeck(addDeck(updateRows(defaultState(), ['basic:Vowels']), animals, NOW), colours, NOW);
  const step = chooseNext({ ...state, settings: { ...state.settings, introduce: false } }, newSession(), { now: NOW });
  assert.equal(step.status === 'card' && step.item.id, '@col/あか/赤');
  const entries = practiceEntries(state).map(entry => entry.item.id);
  assert.deepEqual(entries.slice(0, 4), ['@col/あか/赤', '@zoo/ねこ/猫', '@zoo/いぬ/犬', '@zoo/パンダ']);
  registerDecks([]);
});
