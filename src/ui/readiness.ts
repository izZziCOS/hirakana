import {
  lastMock,
  levelReadiness,
  nextGoal,
  READY_PERCENT,
  type LevelReadiness,
  type SectionReadiness,
} from '../readiness.ts';
import type { State } from '../types.ts';
import { html, type Html } from './html.ts';

const share = (part: number, total: number): number => (total ? Math.round((part / total) * 100) : 0);

function section(label: string, { known, learning, total }: SectionReadiness): Html {
  const description = `${label}: ${known} known, ${learning} learning, ${total - known - learning} not started, of ${total}`;
  return html`<div class="readiness-section" title="${description}">
    <div class="readiness-section-head">
      <span>${label}</span>
      <span class="muted">${known}/${total}</span>
    </div>
    <div class="readiness-bar" role="img" aria-label="${description}">
      <span class="readiness-known" style="width: ${share(known, total)}%"></span
      ><span class="readiness-learning" style="width: ${share(learning, total)}%"></span>
    </div>
  </div>`;
}

function levelRow(entry: LevelReadiness, state: State): Html {
  const mock = lastMock(state, entry.level);
  return html`<div class="readiness-level">
    <div class="readiness-head">
      <strong>N${entry.level}</strong>
      <span class="readiness-percent">${entry.percent}% known</span>
      ${mock && html`<span class="muted small">Last mock test: ${mock.correct}/${mock.total}</span>`}
      <button type="button" class="ghost small readiness-mock" data-mock="${entry.level}">Mock test</button>
    </div>
    <div class="readiness-sections">
      ${section('Kanji', entry.kanji)} ${section('Words', entry.words)} ${section('Grammar', entry.grammar)}
    </div>
  </div>`;
}

function goalText(levels: LevelReadiness[]): string {
  const goal = nextGoal(levels);
  if (!goal) return `You know at least ${READY_PERCENT}% of every level. Mock tests will show what’s left.`;
  return `Next goal: N${goal.level}. You know ${goal.percent}% of it, and ${READY_PERCENT}% puts it within reach.`;
}

export function readinessMarkup(state: State): Html {
  const levels = levelReadiness(state);
  return html`<p class="readiness-goal">${goalText(levels)}</p>
    <div class="legend readiness-legend">
      <span><i class="swatch readiness-known"></i>Known</span>
      <span><i class="swatch readiness-learning"></i>Learning</span>
    </div>
    ${levels.map(entry => levelRow(entry, state))}
    <p class="muted small">
      Known means mastered in any direction. This covers kanji, words and grammar only, not listening or longer reading,
      so treat it as a guide rather than a prediction of an exam result.
    </p>`;
}
