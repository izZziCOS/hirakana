import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTER_ROWS, EXAMPLES, GROUPS, LOOKALIKES, NOTES, WORD_ROWS } from '../src/data.ts';
import { findKana, getKana, isWord, KANA, ROW_INFO } from '../src/kana.ts';

test('every kana is unique', () => {
  const kana = KANA.map(item => item.kana);
  assert.equal(new Set(kana).size, kana.length);
});

test('each character row has matching kana and origins', () => {
  CHARACTER_ROWS.forEach(row => {
    const count = row.romaji.length;
    [row.hiragana, row.katakana, row.hiraganaOrigins, row.katakanaOrigins].forEach(list => {
      if (list) assert.equal(list.length, count, row.label);
    });
    assert.ok(row.hiragana ?? row.katakana, row.label);
  });
});

test('row ids are unique and every item belongs to a known row and group', () => {
  const ids = ROW_INFO.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(GROUPS.map(group => group.id));
  KANA.forEach(item => {
    assert.ok(ids.includes(item.rowId), item.kana);
    assert.ok(groups.has(item.group), item.kana);
  });
});

test('dakuten kana decompose into a known base kana', () => {
  KANA.filter(item => item.group === 'dakuten' || item.kana === 'ヴ').forEach(item => {
    const [base, mark] = Array.from(item.kana.normalize('NFD'));
    assert.ok(findKana(base), item.kana);
    assert.ok(['゙', '゚'].includes(mark ?? ''), item.kana);
  });
});

test('combination kana start with a known kana', () => {
  KANA.filter(item => ['yoon', 'extended'].includes(item.group) && Array.from(item.kana).length === 2).forEach(item => {
    assert.ok(findKana(Array.from(item.kana)[0]), item.kana);
  });
});

test('examples, notes and lookalikes only reference known kana', () => {
  Object.entries(EXAMPLES).forEach(([kana, example]) => {
    assert.ok(findKana(kana), kana);
    assert.ok(example.word.includes(kana), `${kana} missing from ${example.word}`);
    assert.ok(example.reading && example.meaning, kana);
  });
  Object.keys(NOTES).forEach(kana => assert.ok(findKana(kana), kana));
  LOOKALIKES.flat().forEach(kana => assert.ok(findKana(kana), kana));
});

test('small っ & ー words contain a small tsu or a long vowel', () => {
  KANA.filter(item => item.group === 'sokuon').forEach(item => assert.match(item.kana, /[っッーう]/, item.kana));
});

test('every word has a meaning and is at least two kana long', () => {
  KANA.filter(isWord).forEach(item => {
    assert.ok(item.meaning, item.kana);
    assert.ok(Array.from(item.kana).length >= 2, item.kana);
  });
});

test('kanji spellings belong to JLPT words and contain kanji', () => {
  KANA.filter(item => item.kanji).forEach(item => {
    assert.match(item.group, /^n[1-5]$/, item.kana);
    assert.match(item.kanji ?? '', /\p{Script=Han}/u, item.kana);
  });
});

test('every word row has words in a single script', () => {
  WORD_ROWS.forEach(row =>
    row.words.forEach(word => {
      const pattern = row.script === 'hiragana' ? /^[ぁ-ゟ]+$/ : /^[゠-ヿ]+$/;
      assert.match(word.kana, pattern, `${row.label}: ${word.kana}`);
    }),
  );
});

test('accepted answers cover common romanisations', () => {
  const accepts = (kana: string, answer: string) => getKana(kana).accepted.includes(answer);
  assert.ok(accepts('し', 'shi') && accepts('し', 'si'));
  assert.ok(accepts('つ', 'tsu') && accepts('つ', 'tu'));
  assert.ok(accepts('を', 'wo') && accepts('を', 'o'));
  assert.ok(accepts('ぢ', 'ji') && accepts('ぢ', 'di'));
  assert.ok(accepts('ん', 'n') && accepts('ん', 'nn'));
  assert.ok(accepts('ジャ', 'ja') && accepts('ジャ', 'zya'));
  assert.ok(accepts('コーヒー', 'kōhī') && accepts('コーヒー', 'koohii'));
  assert.ok(accepts('がっこう', 'gakkou') && accepts('がっこう', 'gakkoo'));
  assert.ok(accepts('おおきい', 'ookii') && accepts('おおきい', 'ōkii'));
  assert.ok(accepts('ぎゅうにゅう', 'gyuunyuu') && accepts('ぎゅうにゅう', 'gyūnyū'));
  assert.ok(accepts('ニューヨーク', 'nyuuyooku'));
  assert.ok(!accepts('コーヒー', 'kouhii'), 'katakana ー is never spelled with an extra vowel kana');
  assert.ok(!accepts('ウォ', 'o'), 'ウォ must not inherit を’s “o”');
});
