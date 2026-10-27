import { dayKey, dayStreak, forecast } from '../../days.ts';
import { formatWait } from '../../format.ts';
import { statKey } from '../../kana.ts';
import { isDue, isSeen } from '../../schedule.ts';
import { activePool, goalProgress, learnedToday, NEW_BATCH, newLimit } from '../../session.ts';
import { combinedDays } from '../../state.ts';
import type { Session, State } from '../../types.ts';
import { html, type Html } from '../html.ts';

function poolKeys(state: State): string[] {
  const { direction } = state.settings;
  return activePool(state.settings).map(item => statKey(item, direction));
}

const nextDue = (state: State, keys: string[]): number | undefined =>
  keys
    .filter(key => isSeen(state.stats, key))
    .map(key => state.stats[key]?.due ?? Infinity)
    .sort((a, b) => a - b)[0];

export function doneScreen(state: State, now: number): Html {
  const keys = poolKeys(state);
  const today = combinedDays(state)[dayKey(now)];
  const upcoming = nextDue(state, keys);
  const tomorrow = forecast(state.stats, keys, now, 2)[1] ?? 0;
  const unseen = keys.filter(key => !isSeen(state.stats, key)).length;
  const later = [
    upcoming ? `Next review ${formatWait(upcoming - now)}` : '',
    tomorrow ? `${tomorrow} due tomorrow` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return html`
    <div class="done-mark jp" aria-hidden="true">済</div>
    <h2>Done for today</h2>
    <p>
      You answered <strong>${today?.answers ?? 0}</strong> cards today and learned
      <strong>${today?.learned ?? 0}</strong> new ones.
    </p>
    ${later && html`<p class="muted">${later}</p>`}
    <div class="done-actions">
      ${unseen > 0 && html`<button class="primary" data-done="more">Learn ${Math.min(NEW_BATCH, unseen)} more</button>`}
      <button class="ghost" data-done="extra">Extra practice</button>
    </div>
  `;
}

export function sessionBar(state: State, session: Session, now: number): Html {
  const parts: Html[] = [];
  if (!session.drill) {
    const keys = poolKeys(state);
    const due = keys.filter(key => isDue(state.stats, key, now)).length;
    const upcoming = nextDue(state, keys);
    parts.push(html`<span>Due <strong>${due}</strong></span>`);
    parts.push(html`<span>New today <strong>${learnedToday(state, now)}/${newLimit(state, session)}</strong></span>`);
    if (!due && upcoming) parts.push(html`<span>Next review <strong>${formatWait(upcoming - now)}</strong></span>`);
  }
  const accuracy = session.answered ? ` (${Math.round((session.correct / session.answered) * 100)}%)` : '';
  parts.push(
    html`<span>Session <strong>${session.correct}/${session.answered}</strong>${accuracy}</span>`,
    html`<span>Streak <strong>${session.streak}</strong></span>`,
    html`<span>Day streak <strong>${dayStreak(combinedDays(state), now)}</strong></span>`,
  );
  const goal = goalProgress(state.settings, session);
  if (goal) {
    parts.push(
      html`<span class="goal${goal.reached ? ' is-reached' : ''}">
        Goal <strong>${Math.min(goal.done, goal.goal)}/${goal.goal}</strong>
        <progress max="${goal.goal}" value="${Math.min(goal.done, goal.goal)}" aria-label="Session goal"></progress>
      </span>`,
    );
  }
  return html`${parts}`;
}
