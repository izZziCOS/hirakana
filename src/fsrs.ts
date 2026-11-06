// The memory model of FSRS-6 (the Free Spaced Repetition Scheduler, https://github.com/open-spaced-repetition) with its
// published default parameters. A card has a stability, the days until the chance of remembering it falls to 90%, and a
// difficulty from 1 to 10, which sets how fast stability grows. test/fsrs.test.ts holds values from the ts-fsrs package.

export interface Memory {
  stability: number;
  difficulty: number;
}

// Answers are graded by how they went: a miss or a peek is Again, a slow right answer Hard and a right answer Good.
export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
const EASY = 4;
export type RecallGrade = typeof HARD | typeof GOOD;
export type FirstGrade = typeof AGAIN | RecallGrade;

const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483,
  0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const;
const weight = (index: number): number => W[index] ?? 0;
const DECAY = -weight(20);
const FACTOR = Math.exp(Math.log(0.9) / DECAY) - 1;
const MIN_STABILITY = 0.001;
const MAX_STABILITY = 36500;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const clampStability = (stability: number): number => clamp(stability, MIN_STABILITY, MAX_STABILITY);
const clampDifficulty = (difficulty: number): number => clamp(difficulty, 1, 10);

// The chance of remembering a card with this stability after this many days. It is 90% when the two are equal.
export const retrievability = (elapsedDays: number, stability: number): number =>
  (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY;

const rawInitialDifficulty = (grade: number): number => weight(4) - Math.exp((grade - 1) * weight(5)) + 1;

export const firstMemory = (grade: FirstGrade): Memory => ({
  stability: clampStability(weight(grade - 1)),
  difficulty: clampDifficulty(rawInitialDifficulty(grade)),
});

function nextDifficulty(difficulty: number, grade: number): number {
  const change = -weight(6) * (grade - 3);
  const damped = difficulty + (change * (10 - difficulty)) / 9;
  return clampDifficulty(weight(7) * rawInitialDifficulty(EASY) + (1 - weight(7)) * damped);
}

// The longer a right answer has waited and the less likely it was, the more it shows, so a card remembered after months
// away grows by far more than one remembered on time.
export function afterRecall({ stability, difficulty }: Memory, elapsedDays: number, grade: RecallGrade): Memory {
  const recall = retrievability(elapsedDays, stability);
  const growth =
    Math.exp(weight(8)) *
    (11 - difficulty) *
    stability ** -weight(9) *
    (Math.exp((1 - recall) * weight(10)) - 1) *
    (grade === HARD ? weight(15) : 1);
  return { stability: clampStability(stability * (1 + growth)), difficulty: nextDifficulty(difficulty, grade) };
}

export function afterLapse({ stability, difficulty }: Memory, elapsedDays: number): Memory {
  const recall = retrievability(elapsedDays, stability);
  const lapsed =
    weight(11) * difficulty ** -weight(12) * ((stability + 1) ** weight(13) - 1) * Math.exp((1 - recall) * weight(14));
  const ceiling = stability / Math.exp(weight(17) * weight(18));
  return { stability: clampStability(Math.min(lapsed, ceiling)), difficulty: nextDifficulty(difficulty, AGAIN) };
}
