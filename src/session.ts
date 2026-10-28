import { answerOf, buildChoices, isCorrectAnswer } from './choices.ts';
import { dayKey } from './days.ts';
import { DECK_GROUP, deckRowId } from './decks.ts';
import { formatSeconds } from './format.ts';
import { DIRECTIONS, isKanji, KANA, parseStatKey, statKey, supportsDirection } from './kana.ts';
import { mixUpOf } from './mistakes.ts';
import {
  isDue,
  isSeen,
  MAX_TIMED_MS,
  outcomeFor,
  personalPace,
  pickEntry,
  slowThreshold,
  type Stats,
  weightedPick,
} from './schedule.ts';
import { combinedDays, recordAnswer } from './state.ts';
import type {
  Card,
  CardKind,
  Direction,
  Drill,
  Entry,
  KanaItem,
  Mode,
  Outcome,
  PracticeDirection,
  Session,
  Settings,
  State,
} from './types.ts';
import type { Random } from './util.ts';

export const ADVANCE_DELAY: Partial<Record<Outcome, number>> = { correct: 900, slow: 2200 };
export const NEW_BATCH = 5;
export const DRILL_SIZE = 12;
export const MAX_FOLLOW_UPS = 4;

export const newSession = (): Session => ({
  answered: 0,
  correct: 0,
  streak: 0,
  extra: false,
  bonusNew: 0,
  drill: null,
  card: null,
  undo: null,
  followUps: [],
});

export const startDrill = (session: Session, drill: Drill): Session => ({ ...session, drill });
export const endDrill = (session: Session): Session => (session.drill ? { ...session, drill: null } : session);
export const resetCard = (session: Session): Session => (session.card ? { ...session, card: null } : session);
export const learnMore = (session: Session): Session => ({ ...session, bonusNew: session.bonusNew + NEW_BATCH });
export const practiseExtra = (session: Session): Session => ({ ...session, extra: true });

const PRACTICE_SETTINGS = ['script', 'mode', 'direction', 'newPerDay'] as const;

export const affectsPractice = (before: Settings, after: Settings): boolean =>
  PRACTICE_SETTINGS.some(key => before[key] !== after[key]) || before.rows.join() !== after.rows.join();

export const effectiveMode = (settings: Settings, direction: PracticeDirection = settings.direction): Mode =>
  direction === 'match' ? 'choose' : settings.mode;

// Drills and anything else that needs one direction use reading when practice is mixed.
export const singleDirection = (direction: PracticeDirection): Direction =>
  direction === 'mixed' ? 'read' : direction;

// Kanji and imported decks are practised whichever script is picked.
export const rowsPool = (settings: Settings): KanaItem[] =>
  KANA.filter(
    item =>
      (settings.script === 'both' || item.script === settings.script || isKanji(item) || item.group === DECK_GROUP) &&
      settings.rows.includes(item.rowId),
  );

export const activePool = (
  settings: Settings,
  direction: Direction = singleDirection(settings.direction),
): KanaItem[] => rowsPool(settings).filter(item => supportsDirection(item, direction));

// Mixed practice covers reading and every other direction already practised (listening only with a voice).
export function mixedDirections(stats: Stats, voice = true): Direction[] {
  const used = new Set(Object.keys(stats).map(key => parseStatKey(key).direction));
  return DIRECTIONS.filter(
    direction => (direction === 'read' || used.has(direction)) && (voice || direction !== 'listen'),
  );
}

// The words of imported decks come first, the most recently imported deck first: they were imported to be studied.
function byDeck(state: State): (item: KanaItem) => number {
  const rank = new Map(state.decks.map((deck, i) => [deckRowId(deck), state.decks.length - i]));
  return item => rank.get(item.rowId) ?? state.decks.length + 1;
}

export function practiceEntries(state: State, voice = true): Entry[] {
  const { settings, stats } = state;
  const directions = settings.direction === 'mixed' ? mixedDirections(stats, voice) : [settings.direction];
  const rank = byDeck(state);
  return rowsPool(settings)
    .sort((a, b) => rank(a) - rank(b))
    .flatMap(item =>
      directions.filter(direction => supportsDirection(item, direction)).map(direction => ({ item, direction })),
    );
}

export const practiceKeys = (state: State, voice = true): string[] =>
  practiceEntries(state, voice).map(entry => statKey(entry.item, entry.direction));

const canRead = (stats: Stats, item: KanaItem): boolean => (stats[statKey(item, 'read')]?.box ?? 0) >= 2;

// In mixed practice a character is learned by reading it first; the other directions open up once it can be read.
const introducible = (state: State) => (entry: Entry) =>
  state.settings.direction !== 'mixed' || entry.direction === 'read' || canRead(state.stats, entry.item);

export const neverSeen = (stats: Stats, item: KanaItem): boolean =>
  DIRECTIONS.every(direction => !isSeen(stats, statKey(item, direction)));

export const learnedToday = (state: State, now: number): number => combinedDays(state)[dayKey(now)]?.learned ?? 0;

export const newLimit = (state: State, session: Session): number => state.settings.newPerDay + session.bonusNew;

export interface TodaySummary {
  due: number;
  newLeft: number;
}

// What "Continue" will bring up: reviews due now and new cards still allowed today, in the picked rows.
export function todaySummary(state: State, session: Session, now: number): TodaySummary {
  const keys = practiceKeys(state);
  const unseen = keys.filter(key => !isSeen(state.stats, key)).length;
  return {
    due: keys.filter(key => isDue(state.stats, key, now)).length,
    newLeft: Math.min(unseen, Math.max(0, newLimit(state, session) - learnedToday(state, now))),
  };
}

export function emptyMessage(settings: Settings, drill: Drill | null): string {
  if (drill) return 'None of the drilled characters can be practised in this direction.';
  if (!rowsPool(settings).length)
    return `None of the rows you picked exist in ${settings.script}. Choose more rows above.`;
  if (settings.direction === 'match') {
    return 'Matching needs characters that exist in both scripts. Words and loanword katakana can only be read.';
  }
  if (settings.direction === 'meaning') return 'Meaning mode is for kanji and words. Choose some of those rows above.';
  if (settings.direction === 'write')
    return 'Writing works with single kana and kanji. Choose some of those rows above.';
  return 'Kanji can be practised in Read or Meaning mode, and words in every mode but Match and Write. Choose more rows above.';
}

export type NextStep =
  | { status: 'card'; item: KanaItem; kind: CardKind; direction: Direction; choices: string[]; intro: boolean }
  | { status: 'done' }
  | { status: 'empty'; message: string };

interface NextOptions {
  now: number;
  random?: Random;
  // Whether the browser can speak Japanese; without it mixed practice leaves listening out.
  voice?: boolean;
}

export function chooseNext(
  state: State,
  session: Session,
  { now, random = Math.random, voice = true }: NextOptions,
): NextStep {
  const { settings, stats } = state;
  const currentItem = session.card?.item ?? null;
  const entries = practiceEntries(state, voice);
  const drillDirection = singleDirection(settings.direction);
  const drillItems = session.drill?.items.filter(item => supportsDirection(item, drillDirection)) ?? [];
  const followUp = session.drill ? undefined : session.followUps.find(entry => entry.item !== currentItem);

  let pick: { item: KanaItem; kind: CardKind; direction: Direction } | null;
  if (session.drill) {
    const item = weightedPick(drillItems, stats, currentItem, { direction: drillDirection, random });
    pick = item ? { item, kind: 'drill', direction: drillDirection } : null;
  } else if (followUp) {
    pick = { ...followUp, kind: 'contrast' };
  } else {
    const allowNew = learnedToday(state, now) < newLimit(state, session);
    const canIntroduce = introducible(state);
    pick = pickEntry({ entries, stats, currentItem, now, allowNew, canIntroduce, random });
  }

  if (!pick) return { status: 'empty', message: emptyMessage(settings, session.drill) };

  const struggling = entries.some(entry => stats[statKey(entry.item, entry.direction)]?.box === 1);
  if (pick.kind === 'ahead' && !session.extra && !struggling) return { status: 'done' };

  const { direction } = pick;
  const choices =
    effectiveMode(settings, direction) === 'choose' && direction !== 'write'
      ? buildChoices(pick.item, { direction, pool: activePool(settings, direction), drillItems, random })
      : [];
  const intro = settings.introduce && pick.kind === 'new' && neverSeen(stats, pick.item);
  return { status: 'card', ...pick, choices, intro };
}

export function showCard(session: Session, step: NextStep, shownAt: number, untimed = false): Session {
  if (step.status !== 'card') return { ...session, card: null };
  const { item, kind, direction, choices, intro } = step;
  const followUps =
    kind === 'contrast'
      ? session.followUps.filter(entry => entry.item !== item || entry.direction !== direction)
      : session.followUps;
  return {
    ...session,
    undo: null,
    followUps,
    card: {
      item,
      kind,
      direction,
      intro,
      choices,
      answered: false,
      revealed: false,
      untimed,
      shownAt,
      outcome: null,
      given: null,
    },
  };
}

// After a mix-up both characters come back within the next few cards: the one picked by mistake, then the right one.
export function queueContrast(followUps: Entry[], card: Card, given: string | null, now: number): Entry[] {
  const mixUp = given ? mixUpOf({ kana: card.item.id, given, at: now, direction: card.direction }) : null;
  if (!mixUp) return followUps;
  const [item, other] = mixUp;
  const added = [other, item]
    .filter(entry => supportsDirection(entry, card.direction))
    .map(entry => ({ item: entry, direction: card.direction }));
  const isAdded = (entry: Entry) => added.some(next => next.item === entry.item && next.direction === entry.direction);
  return [...followUps.filter(entry => !isAdded(entry)), ...added].slice(-MAX_FOLLOW_UPS);
}

// Ends the introduction of a new character. It counts as learned and comes back as a review a minute later.
export function finishIntro(state: State, session: Session, now: number): { state: State; session: Session } | null {
  const { card } = session;
  if (!card?.intro || card.answered) return null;
  const { item, direction } = card;
  return {
    state: recordAnswer(state, { item, direction, outcome: 'peeked', given: null, ms: null, now, run: session.streak }),
    session: { ...session, undo: null, card: { ...card, answered: true, outcome: 'peeked' } },
  };
}

const updateCard = (session: Session, change: Partial<Card>): Session =>
  session.card && !session.card.answered ? { ...session, card: { ...session.card, ...change } } : session;

export const revealCard = (session: Session): Session =>
  session.card?.revealed ? session : updateCard(session, { revealed: true });

export const markUntimed = (session: Session): Session =>
  session.card?.untimed ? session : updateCard(session, { untimed: true });

export function answerTiming(card: Card, clock: number): number | null {
  const elapsed = clock - card.shownAt;
  return card.untimed || elapsed > MAX_TIMED_MS ? null : elapsed;
}

function countAnswer(session: Session, outcome: Outcome): Session {
  if (outcome === 'correct' || outcome === 'slow') {
    return { ...session, answered: session.answered + 1, correct: session.correct + 1, streak: session.streak + 1 };
  }
  if (outcome === 'wrong') return { ...session, answered: session.answered + 1, streak: 0 };
  return session;
}

export type StageChange = 'kanjiOnly' | 'readingBack';

export interface AnswerResult {
  state: State;
  session: Session;
  outcome: Outcome;
  isCorrect: boolean;
  ms: number | null;
  wasNew: boolean;
  stageChange: StageChange | null;
}

function stageChangeOf(before: State, after: State, key: string): StageChange | null {
  const was = Boolean(before.stats[key]?.kanjiOnly);
  const is = Boolean(after.stats[key]?.kanjiOnly);
  if (was === is) return null;
  return is ? 'kanjiOnly' : 'readingBack';
}

interface AnswerOptions {
  now: number;
  clock: number;
}

export function submitAnswer(
  state: State,
  session: Session,
  given: string | null,
  { now, clock }: AnswerOptions,
): AnswerResult | null {
  const { card } = session;
  if (!card || card.answered) return null;
  const { item, direction } = card;
  const ms = answerTiming(card, clock);
  const isCorrect = isCorrectAnswer(item, direction, given);
  const threshold =
    state.settings.speedCheck === 'off'
      ? Infinity
      : slowThreshold(item, effectiveMode(state.settings, direction), direction, personalPace(state.stats, direction));
  const outcome = outcomeFor({ isCorrect, revealed: card.revealed, ms, threshold });
  const nextSession: Session = {
    ...countAnswer(session, outcome),
    card: { ...card, answered: true, outcome, given },
    undo: { state, session, clock },
    followUps:
      outcome === 'wrong' && !session.drill ? queueContrast(session.followUps, card, given, now) : session.followUps,
  };
  const key = statKey(item, direction);
  const nextState = recordAnswer(state, { item, direction, outcome, given, ms, now, run: nextSession.streak });
  return {
    state: nextState,
    session: nextSession,
    outcome,
    isCorrect,
    ms,
    wasNew: !state.stats[key]?.box,
    stageChange: stageChangeOf(state, nextState, key),
  };
}

export function undoAnswer(session: Session, clock: number): { state: State; session: Session } | null {
  const { undo } = session;
  if (!undo?.session.card) return null;
  return {
    state: undo.state,
    session: { ...undo.session, card: { ...undo.session.card, shownAt: clock, untimed: false } },
  };
}

export function canForgiveTypo(state: State, session: Session): boolean {
  const { card, undo } = session;
  return Boolean(
    undo &&
    card?.outcome === 'wrong' &&
    card.given &&
    effectiveMode(state.settings, card.direction) === 'type' &&
    card.direction !== 'write' &&
    !card.revealed,
  );
}

export function forgiveTypo(state: State, session: Session, now: number): AnswerResult | null {
  const { card, undo } = session;
  if (!card || !undo || !canForgiveTypo(state, session)) return null;
  const answer = answerOf(card.item, card.direction);
  return submitAnswer(undo.state, undo.session, answer, { now, clock: undo.clock });
}

export interface GoalProgress {
  goal: number;
  done: number;
  reached: boolean;
}

export function goalProgress(settings: Settings, session: Session): GoalProgress | null {
  if (!settings.goal) return null;
  return { goal: settings.goal, done: session.answered, reached: session.answered >= settings.goal };
}

export const justReachedGoal = (settings: Settings, before: Session, after: Session): boolean =>
  settings.goal > 0 && before.answered < settings.goal && after.answered >= settings.goal;

interface FeedbackNoteInput {
  outcome: Outcome;
  ms: number | null;
  wasNew: boolean;
  nextReview: string;
  stageChange?: StageChange | null;
}

const STAGE_NOTE: Record<StageChange, string> = {
  kanjiOnly: 'Mastered with the reading shown, so from now on it’s shown as kanji only.',
  readingBack: 'The reading is shown again until you master it.',
};

export function feedbackNote(input: FeedbackNoteInput): string {
  const note = scheduleNote(input);
  if (!input.stageChange) return note;
  return `${note}${note.endsWith('.') ? '' : '.'} ${STAGE_NOTE[input.stageChange]}`;
}

function scheduleNote({ outcome, ms, wasNew, nextReview }: FeedbackNoteInput): string {
  const timing = ms === null ? '' : ` (${formatSeconds(ms)})`;
  if (outcome === 'peeked') return 'You peeked, so it isn’t scored and will come back sooner.';
  if (outcome === 'slow') {
    return wasNew
      ? `Right, but slow${timing}. Next review ${nextReview}.`
      : `Right, but slow${timing}, so it stays at its current step. Next review ${nextReview}.`;
  }
  if (outcome === 'correct') return `Next review ${nextReview}${ms === null ? '' : ` · ${formatSeconds(ms)}`}`;
  return `Next review ${nextReview}`;
}
