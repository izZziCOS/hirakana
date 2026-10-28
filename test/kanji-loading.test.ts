import assert from 'node:assert/strict';
import test from 'node:test';
// Unlike the other test files, this one doesn't import src/kanji.ts: it checks what happens before the kanji load.
import { findKana, KANA, kanjiLoaded, registerKanji, registerVocabulary, ROW_INFO } from '../src/kana.ts';
import { KANJI_DATA } from '../src/kanji-data.ts';
import { loadKanji, needsKanji } from '../src/kanji-loader.ts';
import { migrateState } from '../src/state.ts';
import { VOCAB_DATA } from '../src/vocab-data.ts';

test('saved progress that involves kanji or the full word list is recognised before they load', () => {
  assert.equal(needsKanji(null), false);
  assert.equal(needsKanji('not json'), false);
  assert.equal(
    needsKanji(JSON.stringify({ stats: { あ: {}, 'recall:か': {} }, settings: { rows: ['basic:Vowels'] } })),
    false,
  );
  assert.equal(needsKanji(JSON.stringify({ stats: { 日: {} } })), true);
  assert.equal(needsKanji(JSON.stringify({ stats: { 'meaning:水': {} } })), true);
  assert.equal(needsKanji(JSON.stringify({ settings: { rows: ['k3:N3 · 1–30'] } })), true);
  // Words of the full list are written in kana only, so they are found by their ids and rows.
  assert.equal(needsKanji(JSON.stringify({ stats: { あそこ: {} } })), true);
  assert.equal(needsKanji(JSON.stringify({ mistakes: [{ kana: 'あそこ' }] })), true);
  assert.equal(needsKanji(JSON.stringify({ settings: { rows: ['n5:N5 · 1–30'] } })), true);
  // Imported decks come with the progress and don't need the file.
  assert.equal(needsKanji(JSON.stringify({ stats: { '@abc/ねこ': {} }, settings: { rows: ['custom:abc'] } })), false);
});

test('the kanji and the full word list are added once they have loaded', async () => {
  const kana = KANA.length;
  const rows = ROW_INFO.length;
  assert.equal(kanjiLoaded(), false);
  assert.equal(findKana('日'), undefined);
  assert.equal(findKana('あそこ'), undefined);
  assert.ok(!ROW_INFO.some(row => row.group === 'k5'));
  // Cleaning up saved progress drops cards it doesn't know, which is why kanji progress has to wait for the kanji.
  assert.deepEqual(migrateState({ version: 6, stats: { 日: { box: 2 }, あそこ: { box: 2 } } }).stats, {});

  const loading = loadKanji();
  assert.equal(loadKanji(), loading);
  await loading;
  assert.equal(kanjiLoaded(), true);
  assert.equal(KANA.length, kana + KANJI_DATA.length + VOCAB_DATA.length);
  assert.ok(ROW_INFO.length > rows);
  assert.equal(findKana('日')?.script, 'kanji');
  assert.equal(findKana('あそこ')?.group, 'n5');
  const stats = migrateState({ version: 6, stats: { 日: { box: 2 }, あそこ: { box: 3 } } }).stats;
  assert.equal(stats.日?.box, 2);
  assert.equal(stats.あそこ?.box, 3);

  registerKanji(KANJI_DATA);
  registerVocabulary(VOCAB_DATA);
  assert.equal(KANA.length, kana + KANJI_DATA.length + VOCAB_DATA.length);
});
