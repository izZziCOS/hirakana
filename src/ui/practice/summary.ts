import { dayKey, forecast } from '../../days.ts';
import { formatWait } from '../../format.ts';
import { findKana } from '../../kana.ts';
import { isSeen } from '../../schedule.ts';
import {
  goalProgress,
  learnedToday,
  NEW_BATCH,
  newLimit,
  practiceKeys,
  REVIEW_BATCH,
  reviewedToday,
  todaySummary,
} from '../../session.ts';
import { readableWords } from '../../reading.ts';
import { combinedDays } from '../../state.ts';
import type { KanaItem, Session, State } from '../../types.ts';
import { jp } from '../dom.ts';
import { shortLabel } from '../grammar.ts';
import { html, type Html } from '../html.ts';

export function readableLine(state: State): Html | null {
  const words = readableWords(state.stats);
  if (!words.length) return null;
  const examples = words.slice(0, 3).map(({ item, inKanji }) => jp(inKanji && item.kanji ? item.kanji : item.kana));
  return html`You can read <strong>${words.length}</strong> word${words.length === 1 ? '' : 's'} now, such as
    ${examples.flatMap((example, i) => (i ? [html`, `, example] : [example]))}.`;
}

const poolKeys = (state: State): string[] => practiceKeys(state);

const nextDue = (state: State, keys: string[]): number | undefined =>
  keys
    .filter(key => isSeen(state.stats, key))
    .map(key => state.stats[key]?.due ?? Infinity)
    .sort((a, b) => a - b)[0];

// What was missed this session and can still be found: a deck deleted since takes its words with it.
export const missedItems = (session: Session): KanaItem[] =>
  session.missed.map(id => findKana(id)).filter((item): item is KanaItem => item !== undefined);

function missedSection(items: KanaItem[]): Html {
  return html`<section class="done-missed" aria-labelledby="done-missed-title">
    <h3 id="done-missed-title">Missed this session</h3>
    <ul class="missed-list">
      ${items.map(
        item =>
          html`<li>
            <button type="button" class="missed-item jp" data-open="${item.id}" title="Show details">
              ${item.kanji ?? shortLabel(item)}
            </button>
          </li>`,
      )}
    </ul>
    <button class="primary" data-done="missed">
      Drill ${items.length === 1 ? 'it' : `these ${items.length}`} again
    </button>
  </section>`;
}

export function doneScreen(state: State, session: Session, now: number): Html {
  const keys = poolKeys(state);
  const { held } = todaySummary(state, session, now);
  const limit = state.settings.reviewsPerDay + session.bonusReviews;
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
    ${sessionRecord(session) && html`<p class="muted">This session: ${sessionRecord(session)}.</p>`}
    ${later && html`<p class="muted">${later}</p>`}
    ${
      held > 0 &&
      html`<p class="muted">
        ${held} more review${held === 1 ? ' is' : 's are'} due, waiting for tomorrow: you reached your limit of ${limit}
        today.
      </p>`
    }
    ${missedItems(session).length > 0 && missedSection(missedItems(session))}
    ${readableLine(state) && html`<p class="readable-line">${readableLine(state)}</p>`}
    <div class="done-actions">
      ${
        held > 0 &&
        html`<button class="primary" data-done="reviews">Review ${Math.min(REVIEW_BATCH, held)} more</button>`
      }
      ${unseen > 0 && html`<button class="primary" data-done="more">Learn ${Math.min(NEW_BATCH, unseen)} more</button>`}
      <button class="ghost" data-done="extra">Extra practice</button>
    </div>
  `;
}

// How this sitting has gone so far: "3 of 4 right (75%), 2 in a row".
export function sessionRecord(session: Session): string {
  if (!session.answered) return '';
  const accuracy = Math.round((session.correct / session.answered) * 100);
  const run = session.streak > 1 ? `, ${session.streak} in a row` : '';
  return `${session.correct} of ${session.answered} right (${accuracy}%)${run}`;
}

// The band above a card keeps to what is left: due reviews, new cards and one bar for the session. The rest (the
// review limit, the next review, accuracy and the answer streak) is in the bar's tooltip and on the done screen.
// Tooltips don't show on touch screens or to screen readers, so what they say is also in the text, hidden from view.
const hiddenNote = (text: string): Html | '' => text && html`<span class="visually-hidden"> (${text})</span>`;

export function sessionBar(state: State, session: Session, now: number): Html {
  const record = sessionRecord(session);
  const goal = goalProgress(state.settings, session);
  const goalBar =
    goal &&
    html`<span class="goal${goal.reached ? ' is-reached' : ''}" title="${record}">
      Goal <strong>${Math.min(goal.done, goal.goal)}/${goal.goal}</strong>${hiddenNote(record)}
      <progress max="${goal.goal}" value="${Math.min(goal.done, goal.goal)}" aria-label="Session goal"></progress>
    </span>`;
  if (session.drill) {
    return html`<span title="${record}">Answered <strong>${session.answered}</strong>${hiddenNote(record)}</span
      >${goalBar}`;
  }
  const keys = poolKeys(state);
  const { due, newLeft } = todaySummary(state, session, now);
  const upcoming = nextDue(state, keys);
  const dueNotes = [
    state.settings.reviewsPerDay
      ? `Reviews today: ${reviewedToday(state, now)} of ${state.settings.reviewsPerDay + session.bonusReviews}`
      : '',
    !due && upcoming ? `Next review ${formatWait(upcoming - now)}` : '',
  ].filter(Boolean);
  const left = due + newLeft;
  const total = session.answered + left;
  const todayBar = html`<span class="session-left" title="${record}">
    <progress max="${Math.max(total, 1)}" value="${session.answered}" aria-label="Session progress"></progress>
    <span>${left ? html`<strong>${left}</strong> left` : 'All done'}</span>${hiddenNote(record)}
  </span>`;
  return html`<span title="${dueNotes.join(' · ')}"
      >Due <strong>${due}</strong>${hiddenNote(dueNotes.join(' · '))}</span
    >
    <span>New today <strong>${learnedToday(state, now)}/${newLimit(state, session)}</strong></span>
    ${goalBar || todayBar}`;
}
