import { findKana, isKanji, isWord, KANA, lookalikesOf, normalizeAnswer, supportsDirection } from './kana.ts';
import { parseWritingAnswer, writingPassed } from './handwriting.ts';
import type { Direction, KanaItem } from './types.ts';
import { shuffle, unique, type Random } from './util.ts';

export function wordVariants(romaji: string): string[] {
  const decomposed = romaji.normalize('NFD');
  const withoutMacrons = decomposed.replace(/̄/g, '').normalize('NFC');
  return [
    romaji.replace('tch', 'ch').replace(/([bcdfghjkmprstz])\1/, '$1'),
    withoutMacrons,
    decomposed.replace('̄', '').normalize('NFC'),
    withoutMacrons.replace(/([aeiou])([kstpbdg])(?!\2)/, '$1$2$2'),
    romaji.replace(/[aeiou]$/, vowel => `${vowel}̄`.normalize('NFC')),
  ].filter(variant => variant !== romaji);
}

export function answerOf(item: KanaItem, direction: Direction): string {
  if (direction === 'cloze') return item.cloze?.answers[0] ?? '';
  if (direction === 'recall' || direction === 'listen' || direction === 'write') return item.kana;
  if (direction === 'match') return item.counterpart ?? '';
  if (direction === 'meaning') return item.meanings?.[0] ?? '';
  return item.romaji;
}

// "To eat", "eat" and "Eat (food)" all count as the same meaning.
export const meaningKey = (meaning: string): string =>
  meaning
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .trim()
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

const meaningKeys = (item: KanaItem): Set<string> => new Set((item.meanings ?? []).map(meaningKey));

export function isCorrectAnswer(item: KanaItem, direction: Direction, given: string | null): boolean {
  if (given === null) return false;
  if (direction === 'read') return item.accepted.includes(given);
  if (direction === 'meaning') return meaningKey(given) !== '' && meaningKeys(item).has(meaningKey(given));
  if (direction === 'write') {
    const written = parseWritingAnswer(given);
    return written !== null && writingPassed(written.mistakes, written.strokes);
  }
  const typed = normalizeAnswer(given);
  // A gap is filled in kana or romaji, with any of its right answers.
  if (direction === 'cloze') return item.accepted.includes(typed);
  // A word recalled from its meaning can be typed in kana or in romaji.
  if (direction === 'recall' && isWord(item) && item.accepted.includes(typed)) return true;
  return typed === answerOf(item, direction);
}

const sharesReading = (a: KanaItem, b: KanaItem): boolean =>
  a.accepted.includes(b.romaji) || b.accepted.includes(a.romaji);

interface ChoiceOptions {
  direction?: Direction;
  pool?: KanaItem[];
  drillItems?: KanaItem[];
  random?: Random;
}

// A small imported deck has too few words of its own to choose from, so other words in the same script fill in.
const MIN_GROUP = 4;
function sameGroupItems(item: KanaItem, script = item.script): KanaItem[] {
  const group = KANA.filter(k => k.group === item.group && k.script === script);
  if (group.length >= MIN_GROUP || !isWord(item)) return group;
  return [...group, ...KANA.filter(k => isWord(k) && k.group !== item.group && k.script === script)];
}

function readChoices(item: KanaItem, pool: KanaItem[], drillItems: KanaItem[], random: Random): string[] {
  const sameGroup = sameGroupItems(item).map(k => k.romaji);
  let candidates: string[];
  if (item.group === 'sokuon') {
    candidates = [...wordVariants(item.romaji), ...shuffle(sameGroup, random)];
  } else if (isWord(item)) {
    candidates = [...wordVariants(item.romaji).slice(0, 1), ...shuffle(sameGroup, random)];
  } else if (isKanji(item)) {
    candidates = [
      ...shuffle(drillItems.filter(isKanji), random),
      ...shuffle(pool.filter(isKanji), random),
      ...shuffle(
        KANA.filter(k => k.group === item.group),
        random,
      ),
    ].map(k => k.romaji);
  } else {
    candidates = [
      ...shuffle(
        drillItems.map(k => k.romaji),
        random,
      ),
      ...shuffle(
        lookalikesOf(item).map(k => k.romaji),
        random,
      ),
      ...shuffle(
        [...pool, ...KANA.filter(k => k.group === item.group)].map(k => k.romaji),
        random,
      ),
    ];
  }
  const distractors = unique(candidates).filter(romaji => !item.accepted.includes(romaji));
  return shuffle([item.romaji, ...distractors.slice(0, 3)], random);
}

function meaningChoices(item: KanaItem, pool: KanaItem[], drillItems: KanaItem[], random: Random): string[] {
  const own = meaningKeys(item);
  const candidates = [
    ...shuffle([...drillItems], random),
    ...shuffle(
      pool.filter(k => k.group === item.group),
      random,
    ),
    ...shuffle(
      KANA.filter(k => k.group === item.group),
      random,
    ),
  ].flatMap(k => {
    const meaning = answerOf(k, 'meaning');
    return meaning && !own.has(meaningKey(meaning)) ? [meaning] : [];
  });
  return shuffle([answerOf(item, 'meaning'), ...unique(candidates).slice(0, 3)], random);
}

// Wrong answers come from the point's own options, then the answers of its other sentences and of other points.
function clozeChoices(item: KanaItem, random: Random): string[] {
  const { cloze } = item;
  if (!cloze) return [];
  const answersOf = (items: KanaItem[]) =>
    shuffle(
      items.flatMap(other => other.cloze?.answers.slice(0, 1) ?? []),
      random,
    );
  const candidates = [
    ...shuffle(cloze.point.options, random),
    ...answersOf(KANA.filter(other => other.rowId === item.rowId)),
    ...answersOf(KANA.filter(other => other.group === item.group && other.rowId !== item.rowId)),
  ];
  const distractors = unique(candidates).filter(answer => !cloze.answers.includes(answer));
  return shuffle([answerOf(item, 'cloze'), ...distractors.slice(0, 3)], random);
}

export function buildChoices(
  item: KanaItem,
  { direction = 'read', pool = [], drillItems = [], random = Math.random }: ChoiceOptions = {},
): string[] {
  if (direction === 'read') return readChoices(item, pool, drillItems, random);
  if (direction === 'meaning') return meaningChoices(item, pool, drillItems, random);
  if (direction === 'cloze') return clozeChoices(item, random);

  const sameScript = direction !== 'match';
  const answer = sameScript ? item : findKana(item.counterpart);
  if (!answer) return [];
  const toAnswerScript = (k: KanaItem) => (sameScript ? k : findKana(k.counterpart));
  const candidates = [
    ...shuffle(drillItems.map(toAnswerScript), random),
    ...shuffle(lookalikesOf(answer), random),
    ...shuffle(lookalikesOf(item).map(toAnswerScript), random),
    ...shuffle(pool.filter(k => k.group === item.group).map(toAnswerScript), random),
    ...shuffle(sameGroupItems(item, answer.script), random),
  ].filter(
    (k): k is KanaItem =>
      k !== undefined &&
      k !== answer &&
      k.script === answer.script &&
      isWord(k) === isWord(answer) &&
      supportsDirection(k, direction === 'listen' ? 'listen' : 'recall') &&
      !sharesReading(k, answer),
  );
  const distractors = unique(candidates.map(k => k.kana));
  return shuffle([answer.kana, ...distractors.slice(0, 3)], random);
}
