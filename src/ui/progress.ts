import { GROUPS } from '../data.ts';
import { bestDayStreak, dayStreak, forecast } from '../days.ts';
import { formatSeconds, formatWait } from '../format.ts';
import { isGrammar, isKanji, isWord, KANA, statKey, supportsDirection } from '../kana.ts';
import { recallRate } from '../milestones.ts';
import { readableWords } from '../reading.ts';
import { isDue, levelOf } from '../schedule.ts';
import { singleDirection } from '../session.ts';
import { combinedDays } from '../state.ts';
import type { AppStores } from '../store.ts';
import type { Direction, Group, KanaItem, Script, State } from '../types.ts';
import { renderAccuracyTrend, renderActivityHeatmap } from './charts.ts';
import type { KanaDialog } from './dialog.ts';
import { $, onDelegate, onSegmented, press } from './dom.ts';
import { shortLabel } from './grammar.ts';
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

const MAX_OPEN_CELLS = 120;

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
    readable: $('#readable'),
    readableWords: $('#readable-words'),
    readableTitle: $('#readable-h'),
  };
  let script: Script = data.get().settings.script === 'katakana' ? 'katakana' : 'hiragana';
  let direction: Direction = singleDirection(data.get().settings.direction);
  // Every set can be closed. Kanji levels (up to 1,244 cells) and word levels (up to 2,600) start closed and are drawn
  // only once opened; the others start open. This holds the sets the learner has flipped from how they start.
  const toggled = new Set<string>();

  function cell(state: State, item: KanaItem, now: number, column?: number): Html {
    const stat = state.stats[statKey(item, direction)];
    const level = levelOf(stat);
    const total = stat ? stat.correct + stat.wrong : 0;
    const accuracy = stat && total ? `${Math.round((stat.correct / total) * 100)}%` : '';
    const review = stat?.box ? ` · due ${formatWait(stat.due - now)}` : '';
    const speed = stat?.avgMs ? ` · avg ${formatSeconds(stat.avgMs)}` : '';
    const stage = stat?.kanjiOnly ? ' · stage 2: kanji only' : '';
    return html`<button
      class="cell level-${level}${isWord(item) || isGrammar(item) ? ' word-cell' : ''}${isKanji(item) ? ' kanji-cell' : ''}${
        stat?.kanjiOnly ? ' kanji-only' : ''
      }"
      data-open="${item.id}"
      style="${column === undefined ? '' : `grid-column:${column + 2}`}"
      title="${`${item.kanji ? `${item.kanji} · ` : ''}${item.cloze ? `${item.kana} · ` : ''}${item.romaji} — ${LEVEL_LABEL[level]}${stage}${review}${speed}`}"
    >
      <span class="cell-kana jp">${stat?.kanjiOnly ? (item.kanji ?? item.kana) : shortLabel(item)}</span
      ><span class="cell-romaji">${item.romaji}</span><span class="cell-acc">${accuracy}</span
      ><span class="visually-hidden">${LEVEL_LABEL[level]}${stage}</span>
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

  const READABLE_SHOWN = 40;

  function renderReadable(state: State): void {
    const words = readableWords(state.stats);
    els.readable.hidden = !words.length;
    els.readableTitle.textContent = `Words you can read: ${words.length}`;
    setHtml(
      els.readableWords,
      words.slice(0, READABLE_SHOWN).map(
        ({ item, inKanji }) =>
          html`<button type="button" class="readable-word" data-open="${item.id}" title="${item.meaning ?? ''}">
            <span class="jp">${inKanji && item.kanji ? item.kanji : item.kana}</span>
            <span class="muted small">${item.romaji}</span>
          </button>`,
      ),
    );
  }

  function groupSection(state: State, group: Group, groupItems: KanaItem[], now: number): Html {
    const mastered = groupItems.filter(k => levelOf(state.stats[statKey(k, direction)]) === 'mastered').length;
    const recall = recallRate(state.stats, groupItems, direction);
    const summary = html`<span class="muted"
      >${mastered}/${groupItems.length} mastered${recall !== null && ` · ${recall}% remembered`}</span
    >`;
    const first = groupItems[0];
    const startsOpen = first !== undefined && !isKanji(first) && groupItems.length <= MAX_OPEN_CELLS;
    const open = startsOpen !== toggled.has(group.id);
    return html`<section class="grid-section">
      <h3>
        <button type="button" class="grid-toggle" data-expand="${group.id}" aria-expanded="${String(open)}">
          ${group.label} ${summary}
        </button>
      </h3>
      ${open && first && gridOf(state, group, groupItems, first, now)}
    </section>`;
  }

  function gridOf(state: State, group: Group, groupItems: KanaItem[], first: KanaItem, now: number): Html {
    if (isKanji(first)) return html`<div class="kanji-grid">${groupItems.map(item => cell(state, item, now))}</div>`;
    if (isGrammar(first)) {
      const points = [...new Set(groupItems.map(k => k.row))];
      return html`<div class="grammar-grid">
        ${points.map(
          label =>
            html`<div class="grammar-row">
              <span class="grid-label jp">${label}</span>
              <div class="word-grid">${groupItems.filter(k => k.row === label).map(k => cell(state, k, now))}</div>
            </div>`,
        )}
      </div>`;
    }
    if (isWord(first)) return html`<div class="word-grid">${groupItems.map(item => cell(state, item, now))}</div>`;
    const columns = group.id === 'yoon' ? 'auo' : 'aiueo';
    const rowLabels = [...new Set(groupItems.map(k => k.row))];
    return html`<div class="kana-grid">
      ${rowLabels.map(
        label =>
          html`<div class="grid-row" style="--cols:${columns.length}">
            <span class="grid-label">${label.replace('-row', '')}</span>
            ${groupItems.filter(k => k.row === label).map(k => cell(state, k, now, columnOf(k, columns)))}
          </div>`,
      )}
    </div>`;
  }

  function renderCharts(state: State, now: number): void {
    renderActivityHeatmap(els.activity, combinedDays(state), now, onSelectDay);
    renderAccuracyTrend(els.trend, combinedDays(state), now);
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
      statCard(
        'Day streak',
        html`${dayStreak(combinedDays(state), now)}<small> best ${bestDayStreak(combinedDays(state))}</small>`,
      ),
      statCard('Best run', state.bestStreak),
    ]);
    setHtml(els.forecast, forecastTiles(keys, state, now));
    renderReadable(state);
    renderCharts(state, now);
    setHtml(
      els.grids,
      GROUPS.map(group => {
        // Grammar is shown whichever script is picked.
        const groupItems = items.filter(k => (k.script === script || isGrammar(k)) && k.group === group.id);
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
  onDelegate(els.grids, '[data-open]', element => dialog.open(element.dataset.open ?? ''));
  onDelegate(els.readableWords, '[data-open]', element => dialog.open(element.dataset.open ?? ''));
  onDelegate(els.grids, '[data-expand]', element => {
    const group = element.dataset.expand ?? '';
    if (!toggled.delete(group)) toggled.add(group);
    render();
  });

  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width ?? 0);
    if (width === lastWidth || !isActive()) return;
    lastWidth = width;
    renderCharts(data.get(), Date.now());
  }).observe(els.activity);

  return {
    open() {
      direction = singleDirection(data.get().settings.direction);
      render();
    },
    render,
  };
}
