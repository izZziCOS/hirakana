import assert from 'node:assert/strict';
import test from 'node:test';
// Unlike the other test files, this one doesn't import src/kanji.ts: it checks what happens before the kanji load.
import { findKana, KANA, kanjiLoaded, registerKanji, ROW_INFO } from '../src/kana.ts';
import { KANJI_DATA } from '../src/kanji-data.ts';
import { loadKanji, mentionsKanji } from '../src/kanji-loader.ts';
import { migrateState } from '../src/state.ts';

test('saved progress that involves kanji is recognised before they load', () => {
  assert.equal(mentionsKanji(null), false);
  assert.equal(
    mentionsKanji(JSON.stringify({ stats: { あ: {}, 'recall:か': {} }, settings: { rows: ['basic:Vowels'] } })),
    false,
  );
  assert.equal(mentionsKanji(JSON.stringify({ stats: { 日: {} } })), true);
  assert.equal(mentionsKanji(JSON.stringify({ stats: { 'meaning:水': {} } })), true);
  assert.equal(mentionsKanji(JSON.stringify({ settings: { rows: ['k3:N3 · 1–30'] } })), true);
});

test('the kanji are added once they have loaded', async () => {
  const kana = KANA.length;
  const rows = ROW_INFO.length;
  assert.equal(kanjiLoaded(), false);
  assert.equal(findKana('日'), undefined);
  assert.ok(!ROW_INFO.some(row => row.group === 'k5'));
  // Cleaning up saved progress drops cards it doesn't know, which is why kanji progress has to wait for the kanji.
  assert.deepEqual(migrateState({ version: 6, stats: { 日: { box: 2 } } }).stats, {});

  const loading = loadKanji();
  assert.equal(loadKanji(), loading);
  await loading;
  assert.equal(kanjiLoaded(), true);
  assert.equal(KANA.length, kana + KANJI_DATA.length);
  assert.ok(ROW_INFO.length > rows);
  assert.equal(findKana('日')?.script, 'kanji');
  assert.equal(migrateState({ version: 6, stats: { 日: { box: 2 } } }).stats.日?.box, 2);

  registerKanji(KANJI_DATA);
  assert.equal(KANA.length, kana + KANJI_DATA.length);
});
