export interface Point {
  x: number;
  y: number;
}

export type StrokeVerdict = 'ok' | 'too-short' | 'start' | 'end' | 'shape';

export const STROKE_TOLERANCE = 20;
const SAMPLES = 24;
const MIN_LENGTH_RATIO = 0.35;

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(points: Point[]): number {
  return points.slice(1).reduce((sum, point, i) => sum + distance(points[i] ?? point, point), 0);
}

export function resample(points: Point[], count = SAMPLES): Point[] {
  const first = points[0];
  if (!first) return [];
  const last = points.at(-1) ?? first;
  const total = pathLength(points);
  if (total === 0) return Array.from({ length: count }, () => ({ ...first }));
  const interval = total / (count - 1);
  const source = points.map(point => ({ ...point }));
  const result: Point[] = [{ ...first }];
  let accumulated = 0;
  for (let i = 1; i < source.length && result.length < count; i++) {
    const previous = source[i - 1] ?? first;
    const current = source[i] ?? previous;
    const gap = distance(previous, current);
    if (gap > 0 && accumulated + gap >= interval) {
      const t = (interval - accumulated) / gap;
      const point = { x: previous.x + t * (current.x - previous.x), y: previous.y + t * (current.y - previous.y) };
      result.push(point);
      source.splice(i, 0, point);
      accumulated = 0;
    } else {
      accumulated += gap;
    }
  }
  while (result.length < count) result.push({ ...last });
  return result;
}

export function compareStroke(drawn: Point[], expected: Point[], tolerance = STROKE_TOLERANCE): StrokeVerdict {
  const drawnStart = drawn[0];
  const expectedStart = expected[0];
  const drawnEnd = drawn.at(-1);
  const expectedEnd = expected.at(-1);
  if (!drawnStart || !expectedStart || !drawnEnd || !expectedEnd) return 'too-short';
  const expectedLength = pathLength(expected);
  if (pathLength(drawn) < Math.max(expectedLength * MIN_LENGTH_RATIO, 3)) return 'too-short';
  if (distance(drawnStart, expectedStart) > tolerance) return 'start';
  if (distance(drawnEnd, expectedEnd) > tolerance) return 'end';
  const a = resample(drawn);
  const b = resample(expected);
  const meanGap = a.reduce((sum, point, i) => sum + distance(point, b[i] ?? point), 0) / a.length;
  return meanGap > tolerance * 0.75 ? 'shape' : 'ok';
}

export const STROKE_HINTS: Record<Exclude<StrokeVerdict, 'ok'>, string> = {
  'too-short': 'That stroke was too short.',
  start: 'Start this stroke where the dot is.',
  end: 'This stroke ends somewhere else. Check its direction.',
  shape: 'The shape doesn’t match. Watch the guide and try again.',
};
