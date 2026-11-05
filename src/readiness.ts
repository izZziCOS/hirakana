import { DIRECTIONS, KANA, statKey, supportsDirection } from './kana.ts';
import { levelOf } from './schedule.ts';
import type { GroupId, KanaItem, MockResult, State } from './types.ts';

export type JlptLevel = 1 | 2 | 3 | 4 | 5;
export const JLPT_LEVELS: JlptLevel[] = [5, 4, 3, 2, 1];
// A level counts as within reach at this share of its kanji, words and grammar known.
export const READY_PERCENT = 80;

export interface SectionReadiness {
  known: number;
  learning: number;
  total: number;
}

export interface LevelReadiness {
  level: JlptLevel;
  kanji: SectionReadiness;
  words: SectionReadiness;
  grammar: SectionReadiness;
  // The average share known across the three sections, so a level isn't all about its long word list.
  percent: number;
}

const emptySection = (): SectionReadiness => ({ known: 0, learning: 0, total: 0 });

// Known: mastered in any direction. Learning: seen, but not mastered yet.
function tally(section: SectionReadiness, item: KanaItem, state: State): void {
  section.total++;
  const levels = DIRECTIONS.filter(direction => supportsDirection(item, direction)).map(direction =>
    levelOf(state.stats[statKey(item, direction)]),
  );
  if (levels.includes('mastered')) section.known++;
  else if (levels.some(level => level !== 'new')) section.learning++;
}

export function levelReadiness(state: State): LevelReadiness[] {
  const levels = JLPT_LEVELS.map(level => ({
    level,
    kanji: emptySection(),
    words: emptySection(),
    grammar: emptySection(),
    percent: 0,
  }));
  const sections = new Map<GroupId, SectionReadiness>();
  for (const entry of levels) {
    sections.set(`k${entry.level}`, entry.kanji);
    sections.set(`n${entry.level}`, entry.words);
    sections.set(`g${entry.level}`, entry.grammar);
  }
  for (const item of KANA) {
    const section = sections.get(item.group);
    if (section) tally(section, item, state);
  }
  for (const entry of levels) {
    const shares = [entry.kanji, entry.words, entry.grammar]
      .filter(section => section.total > 0)
      .map(section => section.known / section.total);
    const sum = shares.reduce((total, share) => total + share, 0);
    entry.percent = shares.length ? Math.round((sum / shares.length) * 100) : 0;
  }
  return levels;
}

// The easiest level still short of being within reach.
export const nextGoal = (levels: LevelReadiness[]): LevelReadiness | undefined =>
  levels.find(entry => entry.percent < READY_PERCENT);

export const lastMock = (state: State, level: JlptLevel): MockResult | undefined =>
  state.mockTests.find(result => result.level === level);
