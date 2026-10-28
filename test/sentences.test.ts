import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/kanji.ts';
import { findKana, isKanji } from '../src/kana.ts';
import { parseSentence, readableSentences, SENTENCES, sentences } from '../src/sentences.ts';
import type { Stat } from '../src/types.ts';
import { toMarkup } from '../src/ui/html.ts';
import { readerSummary, sentenceItem } from '../src/ui/sentences.ts';
import { codePoints } from '../src/util.ts';

const learned: Stat = { correct: 1, wrong: 0, streak: 1, box: 2, due: 1e15, last: 0 };
const know = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, learned]));
const HIRAGANA = codePoints(
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん',
);

test('every sentence marks the reading of each kanji, and only JLPT kanji are used', () => {
  assert.ok(SENTENCES.length >= 100);
  sentences.forEach(sentence => {
    sentence.segments.forEach(segment => {
      if (segment.reading) {
        assert.match(segment.text, /\p{Script=Han}/u, sentence.text);
        assert.match(segment.reading, /^[ぁ-ゖ]+$/, sentence.text);
      } else {
        assert.doesNotMatch(segment.text, /\p{Script=Han}/u, `${sentence.text}: a kanji without a reading`);
      }
    });
    sentence.kanji.forEach(kanji => {
      const item = findKana(kanji);
      assert.ok(item && isKanji(item), `${kanji} in ${sentence.text}`);
    });
    assert.match(sentence.text, /[。？！]$/, sentence.text);
    assert.ok(sentence.english.trim(), sentence.text);
  });
  assert.equal(new Set(sentences.map(sentence => sentence.text)).size, sentences.length);
});

test('sentences are split into plain text and kanji with their readings', () => {
  assert.deepEqual(parseSentence('{私|わたし}は{学生|がくせい}です。'), [
    { text: '私', reading: 'わたし' },
    { text: 'は' },
    { text: '学生', reading: 'がくせい' },
    { text: 'です。' },
  ]);
  assert.deepEqual(parseSentence('すみません。'), [{ text: 'すみません。' }]);
});

test('a sentence is readable once every kana and kanji in it is known', () => {
  assert.deepEqual(readableSentences({}), []);
  const kana = know(...HIRAGANA);
  const readable = readableSentences(kana);
  assert.ok(readable.some(sentence => sentence.text === 'すみません。'));
  // で needs the dakuten kana too.
  assert.ok(!readable.some(sentence => sentence.text === 'これは ねこ です。'));
  assert.ok(readableSentences({ ...kana, で: learned }).some(sentence => sentence.text === 'これは ねこ です。'));
  // コーヒー needs katakana and the long ー, and anything with kanji needs the kanji.
  assert.ok(!readable.some(sentence => sentence.text.includes('コーヒー')));
  assert.ok(readable.every(sentence => sentence.kanji.length === 0));

  const withKanji = readableSentences({ ...kana, で: learned, 私: learned, 学: learned, 生: learned });
  assert.ok(withKanji.some(sentence => sentence.text === '私は学生です。'));
  // One kanji still unknown keeps a sentence out.
  assert.ok(
    !readableSentences({ ...kana, で: learned, 私: learned, 学: learned }).some(
      sentence => sentence.text === '私は学生です。',
    ),
  );
});

test('someone learning only kanji is taken to know the kana', () => {
  const readable = readableSentences(know('私', '学', '生'));
  assert.ok(readable.some(sentence => sentence.text === '私は学生です。'));
  assert.ok(readable.every(sentence => sentence.kanji.every(kanji => ['私', '学', '生'].includes(kanji))));
  // Once any kana has been practised, kana count again.
  assert.deepEqual(readableSentences({ ...know('私', '学', '生'), あ: learned }), []);
});

test('readings show over new kanji, all kanji or none', () => {
  const sentence = sentences.find(candidate => candidate.text === '私は学生です。');
  assert.ok(sentence);
  const shown = (furigana: 'new' | 'all' | 'none', stats = know('私')) =>
    (toMarkup(sentenceItem(sentence, 0, { stats, furigana, listen: false })).match(/show-reading/g) ?? []).length;
  assert.equal(shown('new'), 1, 'only 学生 is new');
  assert.equal(shown('all'), 2);
  assert.equal(shown('none'), 0);
  const markup = toMarkup(sentenceItem(sentence, 3, { stats: {}, furigana: 'new', listen: true }));
  assert.match(markup, /<ruby>私<rt>わたし<\/rt><\/ruby>/);
  assert.match(markup, /data-speak="3"/);
  assert.match(markup, /I am a student\./);
  assert.doesNotMatch(toMarkup(sentenceItem(sentence, 3, { stats: {}, furigana: 'new', listen: false })), /data-speak/);
});

test('the reader says how many sentences can be read', () => {
  assert.match(readerSummary(0, 120), /Start with the basic hiragana/);
  assert.equal(readerSummary(12, 120), 'You can read 12 of the 120 sentences with the kana and kanji you know.');
});
