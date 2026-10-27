import { answerOf, buildChoices, isCorrectAnswer } from './choices.ts';
import { dayKey } from './days.ts';
import { formatSeconds } from './format.ts';
import { KANA, statKey, supportsDirection } from './kana.ts';
import { MAX_TIMED_MS, outcomeFor, personalPace, pickNext, slowThreshold, weightedPick } from './schedule.ts';
import { recordAnswer } from './state.ts';
import type { Card, CardKind, Drill, KanaItem, Mode, Outcome, Session, Settings, State } from './types.ts';
import type { Random } from './util.ts';

export const ADVANCE_DELAY: Partial<Record<Outcome, number>> = { correct: 900, slow: 2200 };
export const NEW_BATCH = 5;
export const DRILL_SIZE = 12;

export const newSession = (): Session => ({
  answered: 0,
  correct: 0,
  streak: 0,
  extra: false,
  bonusNew: 0,
  drill: null,
  card: null,
  undo: null,
});

export const startDrill = (session: Session, drill: Drill): Session => ({ ...session, drill });
export const endDrill = (session: Session): Session => (session.drill ? { ...session, drill: null } : session);
export const resetCard = (session: Session): Session => (session.card ? { ...session, card: null } : session);
export const learnMore = (session: Session): Session => ({ ...session, bonusNew: session.bonusNew + NEW_BATCH });
export const practiseExtra = (session: Session): Session => ({ ...session, extra: true });

const PRACTICE_SETTINGS = ['script', 'mode', 'direction', 'newPerDay'] as const;

export const affectsPractice = (before: Settings, after: Settings): boolean =>
  PRACTICE_SETTINGS.some(key => before[key] !== after[key]) || before.rows.join() !== after.rows.join();

export const effectiveMode = (settings: Settings): Mode => (settings.direction === 'match' ? 'choose' : settings.mode);

export const rowsPool = (settings: Settings): KanaItem[] =>
  KANA.filter(
    item => (settings.script === 'both' || item.script === settings.script) && settings.rows.includes(item.rowId),
  );

export const activePool = (settings: Settings): KanaItem[] =>
  rowsPool(settings).filter(item => supportsDirection(item, settings.direction));

export const learnedToday = (state: State, now: number): number => state.days[dayKey(now)]?.learned ?? 0;

export const newLimit = (state: State, session: Session): number => state.settings.newPerDay + session.bonusNew;

export function emptyMessage(settings: Settings, drill: Drill | null): string {
  if (drill) return 'None of the drilled characters can be practised in this direction.';
  if (!rowsPool(settings).length)
    return `None of the rows you picked exist in ${settings.script}. Choose more rows above.`;
  if (settings.direction === 'match') {
    return 'Matching needs characters that exist in both scripts. Words and loanword katakana can only be read.';
  }
  return 'Words can only be practised in Read mode. Choose more rows above.';
}

export type NextStep =
  | { status: 'card'; item: KanaItem; kind: CardKind; choices: string[] }
  | { status: 'done' }
  | { status: 'empty'; message: string };

interface NextOptions {
  now: number;
  random?: Random;
}

export function chooseNext(state: State, session: Session, { now, random = Math.random }: NextOptions): NextStep {
  const { settings, stats } = state;
  const { direction } = settings;
  const currentItem = session.card?.item ?? null;
  const pool = activePool(settings);
  const drillItems = session.drill?.items.filter(item => supportsDirection(item, direction)) ?? [];

  let pick: { item: KanaItem; kind: CardKind } | null;
  if (session.drill) {
    const item = weightedPick(drillItems, stats, currentItem, { direction, random });
    pick = item ? { item, kind: 'drill' } : null;
  } else {
    const allowNew = learnedToday(state, now) < newLimit(state, session);
    pick = pickNext({ pool, stats, direction, currentItem, now, allowNew, random });
  }

  if (!pick) return { status: 'empty', message: emptyMessage(settings, session.drill) };

  const struggling = pool.some(item => stats[statKey(item, direction)]?.box === 1);
  if (pick.kind === 'ahead' && !session.extra && !struggling) return { status: 'done' };

  const choices =
    effectiveMode(settings) === 'choose' ? buildChoices(pick.item, { direction, pool, drillItems, random }) : [];
  return { status: 'card', ...pick, choices };
}

export function showCard(session: Session, step: NextStep, shownAt: number, untimed = false): Session {
  if (step.status !== 'card') return { ...session, card: null };
  const { item, kind, choices } = step;
  return {
    ...session,
    undo: null,
    card: { item, kind, choices, answered: false, revealed: false, untimed, shownAt, outcome: null, given: null },
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

export interface AnswerResult {
  state: State;
  session: Session;
  outcome: Outcome;
  isCorrect: boolean;
  ms: number | null;
  wasNew: boolean;
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
  const { direction } = state.settings;
  const { item } = card;
  const ms = answerTiming(card, clock);
  const isCorrect = isCorrectAnswer(item, direction, given);
  const threshold =
    state.settings.speedCheck === 'off'
      ? Infinity
      : slowThreshold(item, effectiveMode(state.settings), direction, personalPace(state.stats, direction));
  const outcome = outcomeFor({ isCorrect, revealed: card.revealed, ms, threshold });
  const nextSession: Session = {
    ...countAnswer(session, outcome),
    card: { ...card, answered: true, outcome, given },
    undo: { state, session, clock },
  };
  return {
    state: recordAnswer(state, { item, direction, outcome, given, ms, now, run: nextSession.streak }),
    session: nextSession,
    outcome,
    isCorrect,
    ms,
    wasNew: !state.stats[statKey(item, direction)]?.box,
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
    undo && card?.outcome === 'wrong' && card.given && effectiveMode(state.settings) === 'type' && !card.revealed,
  );
}

export function forgiveTypo(state: State, session: Session, now: number): AnswerResult | null {
  const { card, undo } = session;
  if (!card || !undo || !canForgiveTypo(state, session)) return null;
  const answer = answerOf(card.item, undo.state.settings.direction);
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
}

export function feedbackNote({ outcome, ms, wasNew, nextReview }: FeedbackNoteInput): string {
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
