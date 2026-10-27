import { findKana, isWord, KANA, lookalikesOf, normalizeAnswer, supportsDirection } from './kana.ts';
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
  if (direction === 'recall' || direction === 'listen') return item.kana;
  if (direction === 'match') return item.counterpart ?? '';
  return item.romaji;
}

export function isCorrectAnswer(item: KanaItem, direction: Direction, given: string | null): boolean {
  if (given === null) return false;
  if (direction === 'read') return item.accepted.includes(given);
  return normalizeAnswer(given) === answerOf(item, direction);
}

const sharesReading = (a: KanaItem, b: KanaItem): boolean =>
  a.accepted.includes(b.romaji) || b.accepted.includes(a.romaji);

interface ChoiceOptions {
  direction?: Direction;
  pool?: KanaItem[];
  drillItems?: KanaItem[];
  random?: Random;
}

function readChoices(item: KanaItem, pool: KanaItem[], drillItems: KanaItem[], random: Random): string[] {
  const sameGroup = KANA.filter(k => k.group === item.group && k.script === item.script).map(k => k.romaji);
  let candidates: string[];
  if (item.group === 'sokuon') {
    candidates = [...wordVariants(item.romaji), ...shuffle(sameGroup, random)];
  } else if (isWord(item)) {
    candidates = [...wordVariants(item.romaji).slice(0, 1), ...shuffle(sameGroup, random)];
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

export function buildChoices(
  item: KanaItem,
  { direction = 'read', pool = [], drillItems = [], random = Math.random }: ChoiceOptions = {},
): string[] {
  if (direction === 'read') return readChoices(item, pool, drillItems, random);

  const sameScript = direction !== 'match';
  const answer = sameScript ? item : findKana(item.counterpart);
  if (!answer) return [];
  const toAnswerScript = (k: KanaItem) => (sameScript ? k : findKana(k.counterpart));
  const candidates = [
    ...shuffle(drillItems.map(toAnswerScript), random),
    ...shuffle(lookalikesOf(answer), random),
    ...shuffle(lookalikesOf(item).map(toAnswerScript), random),
    ...shuffle(pool.filter(k => k.group === item.group).map(toAnswerScript), random),
    ...shuffle(
      KANA.filter(k => k.group === item.group && k.script === answer.script),
      random,
    ),
  ].filter(
    (k): k is KanaItem =>
      k !== undefined &&
      k !== answer &&
      k.script === answer.script &&
      supportsDirection(k, 'recall') &&
      !sharesReading(k, answer),
  );
  const distractors = unique(candidates.map(k => k.kana));
  return shuffle([answer.kana, ...distractors.slice(0, 3)], random);
}
