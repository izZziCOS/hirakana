import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { KANA } from '../src/kana.ts';
import { searchItems } from '../src/search.ts';

const ids = (query: string, limit?: number) => searchItems(query, KANA, limit).map(item => item.id);

test('an empty search finds nothing', () => {
  assert.deepEqual(searchItems(''), []);
  assert.deepEqual(searchItems('   '), []);
});

test('characters are found by how they are written, in either script', () => {
  assert.equal(ids('水')[0], '水');
  assert.equal(ids('あ')[0], 'あ');
  assert.equal(ids('ア')[0], 'ア');
  assert.equal(ids('ねこ')[0], 'ねこ');
  // Half-width katakana and full-width letters are what some keyboards type.
  assert.equal(ids('ｱ')[0], 'ア');
  assert.equal(ids('ｗａｔｅｒ')[0], ids('water')[0]);
});

test('kana typed in one script also finds what is written in the other', () => {
  assert.ok(ids('ネコ').includes('ねこ'));
  assert.ok(ids('ぱん').some(id => id === 'パン'));
});

test('words are found by their kanji spelling and by romaji', () => {
  assert.equal(searchItems('中学校')[0]?.kana, 'ちゅうがっこう');
  assert.equal(searchItems('gakkou')[0]?.kana, 'がっこう');
  assert.equal(searchItems('GAKKŌ')[0]?.kana, 'がっこう');
  // A sentence that happens to use a word comes after the words themselves.
  const found = searchItems('学校');
  assert.ok(!found[0]?.cloze);
  assert.ok(found.some(item => item.cloze));
});

test('kanji are found by their readings, in kana and romaji', () => {
  assert.ok(ids('みず').includes('水'));
  assert.ok(ids('mizu').includes('水'));
  assert.ok(ids('スイ').includes('水'));
  assert.ok(ids('sui').includes('水'));
});

test('anything with a meaning is found by it, whole meanings first', () => {
  const found = searchItems('water');
  assert.ok(found.some(item => item.id === '水'));
  const exact = found.findIndex(item => item.id === '水');
  const partly = found.findIndex(item => item.meaning?.toLowerCase().includes('waterfall'));
  assert.ok(partly === -1 || exact < partly);
  assert.equal(ids('to eat')[0], ids('eat')[0]);
});

test('a grammar point is listed once, found by its label, pattern or meaning', () => {
  const byLabel = searchItems('～はず');
  assert.equal(byLabel.filter(item => item.cloze?.point.id === 'hazu').length, 1);
  assert.equal(byLabel[0]?.cloze?.point.id, 'hazu');
  assert.ok(searchItems('in order to').some(item => item.cloze?.point.id === 'tame-ni'));
  // Its answers alone aren't enough to find it, or a single particle would bring up every sentence that has it.
  assert.equal(searchItems('ga').filter(item => item.cloze?.point.id === 'ga-subject').length, 0);
});

test('results stop at the limit, and nonsense finds nothing', () => {
  assert.equal(ids('a', 5).length, 5);
  assert.equal(ids('a').length, 50);
  assert.deepEqual(ids('zzzzqq'), []);
});
