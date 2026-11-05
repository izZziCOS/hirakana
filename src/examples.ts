import { parseSentence, plainText, type Segment } from './furigana.ts';
import { isGrammar, isKanji, isWord, KANA } from './kana.ts';
import { SENTENCES } from './sentences.ts';
import type { KanaItem } from './types.ts';

export const EXAMPLES_SHOWN = 3;

export interface ExampleSentence {
  segments: Segment[];
  english: string;
  text: string;
}

const PARTICLE_AFTER = /^[はがをにでとものへか]?$/;

const fromReader: ExampleSentence[] = SENTENCES.map(([markup, english]) => {
  const segments = parseSentence(markup);
  return { segments, english, text: plainText(segments) };
});

// Every sentence the app has, the reading sentences first. Conjugation cards aren't sentences.
function grammarSentences(): ExampleSentence[] {
  return KANA.flatMap(item => {
    const { cloze } = item;
    if (!isGrammar(item) || !cloze || cloze.baseId !== undefined || cloze.distractors) return [];
    const segments = [...cloze.before, { text: cloze.answers[0] ?? '' }, ...cloze.after];
    return [{ segments, english: cloze.english, text: plainText(segments) }];
  });
}

// A verb or adjective rarely appears in its dictionary form: 行く is 行き or 行った in a sentence. A word written with
// okurigana counts when its kanji appear with the reading it starts with, so 行(い)き is 行く but not 行(おこな)う.
function usesInflected(kanji: string, kana: string, sentence: ExampleSentence): boolean {
  if (!/[ぁ-ゖ]$/.test(kanji)) return false;
  const lead = /^\p{Script=Han}+/u.exec(kanji)?.[0];
  if (!lead || !sentence.text.includes(kanji.slice(0, -1))) return false;
  return sentence.segments.some(
    ({ text, reading }) => text === lead && reading !== undefined && kana.startsWith(reading),
  );
}

// A word in kana is matched whole, so いえ isn't found inside いいえ: as the reading over a kanji, as a space-separated
// word with or without its particle, or anywhere when it is katakana or long enough to be unmistakable.
function usesKana(kana: string, sentence: ExampleSentence): boolean {
  if (sentence.segments.some(segment => segment.reading === kana)) return true;
  if (/^[ァ-ヺー]+$/.test(kana)) return sentence.text.includes(kana);
  const plain = sentence.segments.filter(segment => !segment.reading).map(segment => segment.text);
  if (kana.length >= 4 && plain.some(text => text.includes(kana))) return true;
  return plain.some(text =>
    text.split(/[\s、。]+/).some(token => token.startsWith(kana) && PARTICLE_AFTER.test(token.slice(kana.length))),
  );
}

function usesItem(item: KanaItem, sentence: ExampleSentence): boolean {
  if (isKanji(item)) return sentence.text.includes(item.kana);
  const spelling = item.kanji ?? spellings.get(item.id);
  if (!spelling) return usesKana(item.kana, sentence);
  return sentence.text.includes(spelling) || usesInflected(spelling, item.kana, sentence);
}

// The starter words are kept in kana, but their conjugation cards know how they are spelled: たべる is 食べる.
const spellings = new Map<string, string>();

function collectSpellings(): void {
  spellings.clear();
  for (const { cloze } of KANA) {
    if (cloze?.baseId && !spellings.has(cloze.baseId)) {
      const spelling = plainText(cloze.before).replace(' → ', '');
      if (/\p{Script=Han}/u.test(spelling)) spellings.set(cloze.baseId, spelling);
    }
  }
}

let pool: ExampleSentence[] = [];
let poolSize = -1;
const found = new Map<string, ExampleSentence[]>();

// Sentences that use a word or kanji, the shortest first. Remembered, as a card's panel is drawn for every card.
export function examplesOf(item: KanaItem): ExampleSentence[] {
  if (!isKanji(item) && !isWord(item)) return [];
  if (poolSize !== KANA.length) {
    poolSize = KANA.length;
    pool = [...fromReader, ...grammarSentences()];
    collectSpellings();
    found.clear();
  }
  let matches = found.get(item.id);
  if (!matches) {
    matches = pool
      .filter(sentence => usesItem(item, sentence))
      .sort((a, b) => a.text.length - b.text.length)
      .slice(0, EXAMPLES_SHOWN);
    found.set(item.id, matches);
  }
  return matches;
}
