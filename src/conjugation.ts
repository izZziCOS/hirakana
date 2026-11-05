import { parseSentence, plainText } from './furigana.ts';
import {
  conjugateAdjective,
  conjugateVerb,
  type Inflected,
  adjectiveNearMisses,
  ADJECTIVE_FORMS,
} from './conjugate.ts';
import { VERB_FORMS, verbNearMisses } from './conjugate.ts';
import {
  ADJECTIVE_FORM_INFO,
  ADJECTIVES,
  type AdjectiveEntry,
  VERB_FORM_INFO,
  type VerbEntry,
  VERBS,
} from './conjugation-data.ts';
import { addCardRow, isWord, KANA, longVowelSpellings, rowIdOf, wordRomaji } from './kana.ts';
import type { GrammarGroupId, GrammarPoint, KanaItem } from './types.ts';
import { unique } from './util.ts';

export const MAX_DISTRACTORS = 6;

// {食|た}べる from 食べる and たべる: the kana both end in are written as they are.
export function furiganaOf(kana: string, kanji: string): string {
  if (!kanji) return kana;
  let shared = 0;
  while (shared < Math.min(kana.length, kanji.length) && kana.at(-1 - shared) === kanji.at(-1 - shared)) shared++;
  return `{${kanji.slice(0, kanji.length - shared)}|${kana.slice(0, kana.length - shared)}}${kana.slice(kana.length - shared)}`;
}

interface FormInfo {
  id: string;
  label: string;
  meaning: string;
  note: string;
}

const pointOf = (info: FormInfo): GrammarPoint => ({
  id: info.id,
  level: 5,
  label: info.label,
  pattern: `dictionary form → ${info.label}`,
  meaning: info.meaning,
  note: info.note,
  options: [],
  sentences: [],
});

interface CardInput {
  point: GrammarPoint;
  group: GrammarGroupId;
  word: { kana: string; kanji: string; meaning: string };
  inflected: Inflected;
  // Wrong answers, most likely mistakes first; the right answers are taken out here.
  wrong: string[];
  baseId: string | undefined;
}

function cardOf({ point, group, word, inflected, wrong, baseId }: CardInput): KanaItem {
  const answers = inflected.kana;
  const answer = answers[0] ?? '';
  const before = parseSentence(`${furiganaOf(word.kana, word.kanji)} → `);
  const romaji = unique(
    // ではない is read dewanai, with は as a particle, and may be typed as written too.
    answers
      .flatMap(kana => [kana.replace('では', 'でわ'), kana])
      .flatMap(kana => {
        const { romaji: main, alternatives } = wordRomaji(kana);
        return [main, ...alternatives].flatMap(spelling => longVowelSpellings(spelling, 'hiragana'));
      }),
  );
  const row = { label: point.label, group };
  const english = `${word.meaning} · ${point.label}`;
  return {
    id: `~${point.id}/${word.kanji || word.kana}`,
    kana: plainText(before) + answer,
    script: 'hiragana',
    romaji: romaji[0] ?? '',
    row: row.label,
    rowId: rowIdOf(row),
    group,
    // The answer can also be typed with the word's kanji, as an input method would write it.
    accepted: unique([...answers, ...inflected.kanji, ...romaji]),
    meaning: english,
    cloze: {
      point,
      before,
      after: [],
      answers,
      english,
      reading: `${word.kana}、${answer}`,
      ...(baseId ? { baseId } : {}),
      distractors: unique(wrong)
        .filter(option => !answers.includes(option))
        .slice(0, MAX_DISTRACTORS),
    },
  };
}

// The word a conjugation card is about, so words the learner already knows can come first.
function wordIndex(): (kana: string, kanji: string) => string | undefined {
  const ids = new Map<string, string>();
  const byKana = new Map<string, string>();
  KANA.filter(isWord).forEach(item => {
    const key = `${item.kana}|${item.kanji ?? ''}`;
    if (!ids.has(key)) ids.set(key, item.id);
    if (!byKana.has(item.kana)) byKana.set(item.kana, item.id);
  });
  // The list may spell a word differently (終る for 終わる), so the kana alone will do when the spelling isn't there.
  const find = (kana: string, kanji: string) => ids.get(`${kana}|${kanji}`) ?? byKana.get(kana);
  return (kana, kanji) => {
    // 勉強する is listed as 勉強.
    const noun = kana.endsWith('する') ? find(kana.slice(0, -2), kanji.slice(0, -2)) : undefined;
    return find(kana, kanji) ?? noun;
  };
}

function verbCards(entries: VerbEntry[], baseOf: (kana: string, kanji: string) => string | undefined): void {
  for (const form of VERB_FORMS) {
    const point = pointOf(VERB_FORM_INFO[form]);
    const cards = entries
      .filter(entry => !entry.skip?.includes(form))
      .map(entry => {
        const { kana, kanji, verbClass } = entry;
        // A verb usually written in kana has no kanji to keep.
        const spelling = kanji || kana;
        const others = VERB_FORMS.filter(other => other !== form).flatMap(
          other => conjugateVerb(kana, spelling, verbClass, other).kana,
        );
        return cardOf({
          point,
          group: 'cv',
          word: entry,
          inflected: conjugateVerb(kana, spelling, verbClass, form),
          wrong: [...verbNearMisses(kana, verbClass, form), ...others],
          baseId: baseOf(kana, kanji),
        });
      });
    addCardRow({ label: point.label, group: 'cv' }, cards);
  }
}

function adjectiveCards(entries: AdjectiveEntry[], baseOf: (kana: string, kanji: string) => string | undefined): void {
  for (const form of ADJECTIVE_FORMS) {
    const point = pointOf(ADJECTIVE_FORM_INFO[form]);
    const cards = entries
      .filter(entry => !entry.skip?.includes(form))
      .map(entry => {
        const { kana, kanji, adjectiveClass } = entry;
        const spelling = kanji || kana;
        const others = ADJECTIVE_FORMS.filter(other => other !== form).flatMap(
          other => conjugateAdjective(kana, spelling, adjectiveClass, other).kana,
        );
        return cardOf({
          point,
          group: 'ca',
          word: entry,
          inflected: conjugateAdjective(kana, spelling, adjectiveClass, form),
          wrong: [...adjectiveNearMisses(kana, adjectiveClass, form), ...others],
          baseId: baseOf(kana, kanji),
        });
      });
    addCardRow({ label: point.label, group: 'ca' }, cards);
  }
}

let registered = false;

// Adds a row of cards per form. It runs after the word list is in, to link each card to its word.
export function registerConjugation(): void {
  if (registered) return;
  registered = true;
  const baseOf = wordIndex();
  verbCards(VERBS, baseOf);
  adjectiveCards(ADJECTIVES, baseOf);
}
