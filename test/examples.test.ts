import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLES_SHOWN, examplesOf } from '../src/examples.ts';
import { getKana, isWord, KANA } from '../src/kana.ts';
import '../src/kanji.ts';
import { defaultState } from '../src/state.ts';
import { toMarkup } from '../src/ui/html.ts';
import { renderInfo } from '../src/ui/info.ts';

const NOW = new Date(2026, 0, 10, 12).getTime();
const wordOf = (kanji: string) => {
  const word = KANA.find(item => item.kanji === kanji);
  assert.ok(word, kanji);
  return word;
};
const texts = (id: string) => examplesOf(getKana(id)).map(sentence => sentence.text);

test('a kanji’s sentences contain it, the shortest first', () => {
  const found = texts('水');
  assert.ok(found.length > 0);
  assert.ok(found.every(text => text.includes('水')));
  const lengths = found.map(text => text.length);
  assert.deepEqual(
    lengths,
    [...lengths].sort((a, b) => a - b),
  );
  assert.ok(found.length <= EXAMPLES_SHOWN);
});

test('a word in kana is found as the reading over its kanji or as a word of its own', () => {
  assert.ok(texts('みず').some(text => text.includes('水')));
  assert.ok(texts('ねこ').some(text => text.includes('ねこ') || text.includes('猫')));
});

test('a word in kana isn’t found inside another word', () => {
  // いえ (house) is in いいえ (no), which the sentences use.
  assert.ok(!texts('いえ').some(text => text.includes('いいえ')));
});

test('a verb is found in its other forms, with the reading it starts with', () => {
  const go = examplesOf(getKana('いく')).map(sentence => sentence.text);
  assert.ok(go.length > 0);
  assert.ok(go.every(text => text.includes('行')));
  // 行う uses the same kanji with another reading.
  assert.ok(!go.some(text => text.includes('行う') || text.includes('行わ')));
  const eat = examplesOf(getKana('たべる')).map(sentence => sentence.text);
  assert.ok(eat.some(text => text.includes('食べ')));
});

test('kanji spellings are found exactly, with okurigana or without', () => {
  const study = wordOf('勉強');
  assert.ok(examplesOf(study).every(sentence => sentence.text.includes('勉強')));
  assert.ok(examplesOf(study).length > 0);
});

test('grammar sentences are shown with their gap filled in, and conjugation cards aren’t sentences', () => {
  const all = KANA.filter(isWord).flatMap(examplesOf);
  assert.ok(all.every(sentence => !sentence.text.includes('→')));
  const bread = examplesOf(getKana('たべる')).concat(examplesOf(wordOf('毎朝')));
  assert.ok(bread.every(sentence => sentence.english.length > 0));
});

test('kana and grammar cards have no sentences to look up', () => {
  assert.deepEqual(examplesOf(getKana('あ')), []);
  assert.deepEqual(examplesOf(getKana('~wa-topic/1')), []);
});

test('sentences are remembered, not looked up for every card', () => {
  const item = getKana('水');
  assert.equal(examplesOf(item), examplesOf(item));
});

test('the info panel shows them, with readings over kanji not yet known', () => {
  const info = toMarkup(renderInfo(getKana('水'), defaultState(), NOW));
  assert.ok(info.includes('In a sentence'));
  assert.match(info, /<ruby>水<rt>みず<\/rt><\/ruby>/);
  assert.ok(!toMarkup(renderInfo(getKana('あ'), defaultState(), NOW)).includes('In a sentence'));
});
