import { buildChoices, isCorrectAnswer } from './choices.ts';
import { isGrammar, isKanji, KANA, supportsDirection } from './kana.ts';
import type { JlptLevel } from './readiness.ts';
import type { Direction, KanaItem } from './types.ts';
import { type Random, shuffle } from './util.ts';

export const MOCK_SECTION_SIZE = 10;
export const MOCK_SECONDS = 15 * 60;

export type MockSection = 'kanji' | 'words' | 'grammar';
export const MOCK_SECTIONS: MockSection[] = ['kanji', 'words', 'grammar'];

export interface MockQuestion {
  section: MockSection;
  item: KanaItem;
  direction: Direction;
  choices: string[];
}

// A sample of the level: the reading of its kanji, the meaning of its words and the gap in its grammar sentences, with
// one sentence per grammar point. It doesn't depend on what has been learned, as an exam doesn't.
export function buildMockTest(level: JlptLevel, random: Random = Math.random): MockQuestion[] {
  const inGroup = (group: string) => KANA.filter(item => item.group === group);
  const kanji = inGroup(`k${level}`).filter(isKanji);
  const words = inGroup(`n${level}`).filter(item => supportsDirection(item, 'meaning'));
  const points = new Map<string, KanaItem>();
  shuffle(inGroup(`g${level}`).filter(isGrammar), random).forEach(item => {
    if (!points.has(item.rowId)) points.set(item.rowId, item);
  });
  const take = (items: KanaItem[], section: MockSection, direction: Direction): MockQuestion[] =>
    shuffle([...items], random)
      .slice(0, MOCK_SECTION_SIZE)
      .map(item => ({
        section,
        item,
        direction,
        choices: buildChoices(item, { direction, pool: items, random }),
      }));
  return [
    ...take(kanji, 'kanji', 'read'),
    ...take(words, 'words', 'meaning'),
    ...take([...points.values()], 'grammar', 'cloze'),
  ];
}

export interface MockScore {
  correct: number;
  total: number;
  sections: Record<MockSection, { correct: number; total: number }>;
  missed: MockQuestion[];
}

// `answers` holds what was picked for each question: null, or nothing at all, for one skipped or not reached in time.
export function scoreMock(questions: MockQuestion[], answers: (string | null)[]): MockScore {
  const score: MockScore = {
    correct: 0,
    total: questions.length,
    sections: { kanji: { correct: 0, total: 0 }, words: { correct: 0, total: 0 }, grammar: { correct: 0, total: 0 } },
    missed: [],
  };
  questions.forEach((question, i) => {
    const section = score.sections[question.section];
    section.total++;
    if (isCorrectAnswer(question.item, question.direction, answers[i] ?? null)) {
      section.correct++;
      score.correct++;
    } else {
      score.missed.push(question);
    }
  });
  return score;
}

export const formatClock = (seconds: number): string => {
  const left = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
};
