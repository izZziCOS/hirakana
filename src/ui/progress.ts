import { GROUPS } from '../data.ts';
import { bestDayStreak, dayStreak, forecast } from '../days.ts';
import { formatSeconds, formatWait } from '../format.ts';
import { isWord, KANA, statKey, supportsDirection } from '../kana.ts';
import { isDue, levelOf } from '../schedule.ts';
import type { AppStores } from '../store.ts';
import type { Direction, Group, KanaItem, Script, State } from '../types.ts';
import { renderAccuracyTrend, renderActivityHeatmap } from './charts.ts';
import type { KanaDialog } from './dialog.ts';
import { $, onDelegate, onSegmented, press } from './dom.ts';
import { html, setHtml, type Html } from './html.ts';
import { LEVEL_LABEL } from './labels.ts';

export interface ProgressView {
  open(): void;
  render(): void;
}

function columnOf(item: KanaItem, columns: string): number {
  const index = columns.indexOf(item.romaji.slice(-1));
  return index === -1 ? 0 : index;
}

const statCard = (label: string, value: Html | string | number): Html =>
  html`<div class="stat-card">
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;

interface ProgressOptions {
  dialog: KanaDialog;
  isActive: () => boolean;
  onSelectDay: (day: string) => void;
}

export function createProgress({ data }: AppStores, { dialog, isActive, onSelectDay }: ProgressOptions): ProgressView {
  const els = {
    overall: $('#overall'),
    forecast: $('#forecast'),
    activity: $('#activity'),
    trend: $('#trend'),
    grids: $('#progress-grids'),
  };
  let script: Script = data.get().settings.script === 'katakana' ? 'katakana' : 'hiragana';
  let direction: Direction = data.get().settings.direction;

  function cell(state: State, item: KanaItem, now: number, column?: number): Html {
    const stat = state.stats[statKey(item, direction)];
    const level = levelOf(stat);
    const total = stat ? stat.correct + stat.wrong : 0;
    const accuracy = stat && total ? `${Math.round((stat.correct / total) * 100)}%` : '';
    const review = stat?.box ? ` · due ${formatWait(stat.due - now)}` : '';
    const speed = stat?.avgMs ? ` · avg ${formatSeconds(stat.avgMs)}` : '';
    return html`<button
      class="cell level-${level}${isWord(item) ? ' word-cell' : ''}"
      data-kana="${item.kana}"
      style="${column === undefined ? '' : `grid-column:${column + 2}`}"
      title="${`${item.romaji} — ${LEVEL_LABEL[level]}${review}${speed}`}"
    >
      <span class="cell-kana jp">${item.kana}</span><span class="cell-romaji">${item.romaji}</span
      ><span class="cell-acc">${accuracy}</span><span class="visually-hidden">${LEVEL_LABEL[level]}</span>
    </button>`;
  }

  function forecastTiles(keys: string[], state: State, now: number): Html[] {
    const counts = forecast(state.stats, keys, now, 7);
    const peak = Math.max(1, ...counts);
    return counts.map((count, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      const label = i === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' });
      return html`<div class="forecast-day" style="--fill:${count / peak}">
        <span class="forecast-count">${count}</span><span class="forecast-label">${label}</span>
      </div>`;
    });
  }

  function groupSection(state: State, group: Group, groupItems: KanaItem[], now: number): Html {
    const mastered = groupItems.filter(k => levelOf(state.stats[statKey(k, direction)]) === 'mastered').length;
    const first = groupItems[0];
    let body: Html;
    if (first && isWord(first)) {
      body = html`<div class="word-grid">${groupItems.map(item => cell(state, item, now))}</div>`;
    } else {
      const columns = group.id === 'yoon' ? 'auo' : 'aiueo';
      const rowLabels = [...new Set(groupItems.map(k => k.row))];
      body = html`<div class="kana-grid">
        ${rowLabels.map(
          label =>
            html`<div class="grid-row" style="--cols:${columns.length}">
              <span class="grid-label">${label.replace('-row', '')}</span>
              ${groupItems.filter(k => k.row === label).map(k => cell(state, k, now, columnOf(k, columns)))}
            </div>`,
        )}
      </div>`;
    }
    return html`<section class="grid-section">
      <h3>${group.label} <span class="muted">${mastered}/${groupItems.length} mastered</span></h3>
      ${body}
    </section>`;
  }

  function renderCharts(state: State, now: number): void {
    renderActivityHeatmap(els.activity, state.days, now, onSelectDay);
    renderAccuracyTrend(els.trend, state.days, now);
  }

  function render(): void {
    const now = Date.now();
    const state = data.get();
    const items = KANA.filter(k => supportsDirection(k, direction));
    const keys = items.map(k => statKey(k, direction));
    const stats = keys.map(key => state.stats[key]).filter(stat => stat !== undefined);
    const answered = stats.reduce((sum, s) => sum + s.correct + s.wrong, 0);
    const correct = stats.reduce((sum, s) => sum + s.correct, 0);
    const mastered = stats.filter(s => levelOf(s) === 'mastered').length;
    const due = keys.filter(key => isDue(state.stats, key, now)).length;

    press('#progress-script', script);
    press('#progress-direction', direction);
    setHtml(els.overall, [
      statCard('Answers', answered),
      statCard('Accuracy', answered ? `${Math.round((correct / answered) * 100)}%` : '—'),
      statCard('Mastered', html`${mastered}<small>/${items.length}</small>`),
      statCard('Due now', due),
      statCard('Day streak', html`${dayStreak(state.days, now)}<small> best ${bestDayStreak(state.days)}</small>`),
      statCard('Best run', state.bestStreak),
    ]);
    setHtml(els.forecast, forecastTiles(keys, state, now));
    renderCharts(state, now);
    setHtml(
      els.grids,
      GROUPS.map(group => {
        const groupItems = items.filter(k => k.script === script && k.group === group.id);
        return groupItems.length ? groupSection(state, group, groupItems, now) : null;
      }),
    );
  }

  onSegmented('#progress-script', value => {
    script = value as Script;
    render();
  });
  onSegmented('#progress-direction', value => {
    direction = value as Direction;
    render();
  });
  onDelegate(els.grids, '[data-kana]', element => dialog.open(element.dataset.kana ?? ''));

  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width ?? 0);
    if (width === lastWidth || !isActive()) return;
    lastWidth = width;
    renderCharts(data.get(), Date.now());
  }).observe(els.activity);

  return {
    open() {
      direction = data.get().settings.direction;
      render();
    },
    render,
  };
}
