import {
  calendarWeeks,
  dateOf,
  dayKey,
  type Days,
  heatLevel,
  heatThresholds,
  weeklyAccuracy,
  type WeekAccuracy,
} from '../days.ts';
import { html, setHtml, type Html } from './html.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 11;
const CELL_GAP = 3;
const DAY_LABEL_WIDTH = 26;
const MONTH_LABEL_HEIGHT = 14;
const TREND_WEEKS = 12;
const TREND_HEIGHT = 180;
const TREND_PADDING = { top: 14, right: 44, bottom: 24, left: 40 };

const shortDate = (key: string): string =>
  dateOf(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const longDate = (key: string): string =>
  dateOf(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const percent = (value: number): string => `${Math.round(value * 100)}%`;

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function createTooltip(container: HTMLElement) {
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  container.append(tooltip);
  return {
    show(anchor: { x: number; y: number }, value: string, label: string, detail = '') {
      const strong = document.createElement('strong');
      strong.textContent = value;
      const lines = [label, detail].filter(Boolean).map(text => {
        const line = document.createElement('span');
        line.textContent = text;
        return line;
      });
      tooltip.replaceChildren(strong, ...lines);
      tooltip.hidden = false;
      const maxLeft = container.clientWidth - tooltip.offsetWidth - 4;
      tooltip.style.left = `${Math.max(4, Math.min(anchor.x - tooltip.offsetWidth / 2, maxLeft))}px`;
      tooltip.style.top = `${Math.max(0, anchor.y - tooltip.offsetHeight - 8)}px`;
    },
    hide() {
      tooltip.hidden = true;
    },
  };
}

function anchorOf(element: Element, container: HTMLElement): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  const frame = container.getBoundingClientRect();
  return { x: box.left - frame.left + box.width / 2, y: box.top - frame.top };
}

function tableView(caption: string, headers: string[], rows: (string | number)[][]): Html {
  return html`<details class="chart-table">
    <summary>Show as table</summary>
    <table>
      <caption class="visually-hidden">
        ${caption}
      </caption>
      <thead>
        <tr>
          ${headers.map(header => html`<th scope="col">${header}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          row =>
            html`<tr>
              ${row.map(cell => html`<td>${cell}</td>`)}
            </tr>`,
        )}
      </tbody>
    </table>
  </details>`;
}

function heatRanges(thresholds: number[]): string[] {
  return thresholds.map((start, i) => {
    const next = thresholds[i + 1];
    if (next === undefined) return `${start}+ answers`;
    return next - 1 > start ? `${start}–${next - 1} answers` : `${start} answer${start === 1 ? '' : 's'}`;
  });
}

export function renderActivityHeatmap(
  container: HTMLElement,
  days: Days,
  now: number,
  onSelectDay: (day: string) => void,
): void {
  const available = Math.max(container.clientWidth, 280);
  const weekCount = Math.max(8, Math.min(26, Math.floor((available - DAY_LABEL_WIDTH) / (CELL + CELL_GAP))));
  const weeks = calendarWeeks(now, weekCount);
  const today = dayKey(now);
  const width = DAY_LABEL_WIDTH + weekCount * (CELL + CELL_GAP);
  const height = MONTH_LABEL_HEIGHT + 7 * (CELL + CELL_GAP);
  const shown = weeks.flat().filter(key => key <= today);
  const practised = shown.filter(key => days[key]?.answers).length;
  const thresholds = heatThresholds(shown.map(key => days[key]?.answers ?? 0));

  const svg = svgElement('svg', {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    class: 'heatmap',
    role: 'group',
    'aria-label': `Practice activity over the last ${weekCount} weeks: ${practised} days practised`,
  });

  ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((label, row) => {
    if (!label) return;
    const text = svgElement('text', {
      x: 0,
      y: MONTH_LABEL_HEIGHT + row * (CELL + CELL_GAP) + CELL - 1,
      class: 'chart-axis-label',
    });
    text.textContent = label;
    svg.append(text);
  });

  let lastMonth = -1;
  weeks.forEach((week, column) => {
    const x = DAY_LABEL_WIDTH + column * (CELL + CELL_GAP);
    const monday = dateOf(week[0] ?? today);
    const month = monday.getMonth();
    if (month !== lastMonth && column < weekCount - 1) {
      const text = svgElement('text', { x, y: MONTH_LABEL_HEIGHT - 4, class: 'chart-axis-label' });
      text.textContent = monday.toLocaleDateString(undefined, { month: 'short' });
      svg.append(text);
      lastMonth = month;
    }
    week.forEach((key, row) => {
      if (key > today) return;
      const log = days[key];
      const cell = svgElement('rect', {
        x,
        y: MONTH_LABEL_HEIGHT + row * (CELL + CELL_GAP),
        width: CELL,
        height: CELL,
        rx: 2,
        class: `heat-cell heat-${heatLevel(log?.answers ?? 0, thresholds)}`,
        tabindex: 0,
        role: 'button',
        'data-day': key,
        'aria-label': `${longDate(key)}: ${log?.answers ?? 0} answers`,
      });
      svg.append(cell);
    });
  });

  const ranges = ['No answers', ...heatRanges(thresholds)];
  const legend = html`<div class="heat-legend">
    Less ${ranges.map((range, level) => html`<i class="heat-swatch heat-${level}" title="${range}"></i>`)} More
  </div>`;
  const recent = [...shown].reverse().slice(0, 14);
  setHtml(container, [
    html`<div class="chart-frame"></div>`,
    legend,
    tableView(
      'Answers per day, last 14 days',
      ['Day', 'Answers', 'New', 'Accuracy'],
      recent.map(key => {
        const log = days[key];
        return [
          longDate(key),
          log?.answers ?? 0,
          log?.learned ?? 0,
          log?.scored ? percent(log.correct / log.scored) : '—',
        ];
      }),
    ),
  ]);

  const frame = container.querySelector<HTMLElement>('.chart-frame');
  if (!frame) return;
  frame.append(svg);
  const tooltip = createTooltip(frame);
  const showCell = (target: EventTarget | null) => {
    if (!(target instanceof SVGRectElement) || !target.dataset.day) return;
    const key = target.dataset.day;
    const log = days[key];
    const accuracy = log?.scored ? `${percent(log.correct / log.scored)} accuracy` : '';
    tooltip.show(
      anchorOf(target, frame),
      `${log?.answers ?? 0} answers`,
      longDate(key),
      [log?.learned ? `${log.learned} new` : '', accuracy].filter(Boolean).join(' · '),
    );
  };
  const selectCell = (target: EventTarget | null) => {
    if (target instanceof SVGRectElement && target.dataset.day) onSelectDay(target.dataset.day);
  };
  svg.addEventListener('click', event => selectCell(event.target));
  svg.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectCell(event.target);
  });
  svg.addEventListener('pointerover', event => showCell(event.target));
  svg.addEventListener('focusin', event => showCell(event.target));
  svg.addEventListener('pointerleave', () => tooltip.hide());
  svg.addEventListener('focusout', () => tooltip.hide());
}

function linePath(points: ({ x: number; y: number } | null)[]): string {
  let path = '';
  let penDown = false;
  points.forEach(point => {
    if (!point) {
      penDown = false;
      return;
    }
    path += `${penDown ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    penDown = true;
  });
  return path;
}

export function renderAccuracyTrend(container: HTMLElement, days: Days, now: number): void {
  const weeks: WeekAccuracy[] = weeklyAccuracy(days, now, TREND_WEEKS);
  const last = weeks.filter(week => week.accuracy !== null).at(-1);
  const table = tableView(
    'Accuracy per week',
    ['Week of', 'Scored answers', 'Accuracy'],
    [...weeks]
      .reverse()
      .map(week => [shortDate(week.start), week.scored, week.accuracy === null ? '—' : percent(week.accuracy)]),
  );
  if (!last) {
    setHtml(container, html`<p class="empty">No scored answers yet. Your weekly accuracy will appear here.</p>`);
    return;
  }

  const width = Math.max(container.clientWidth, 280);
  const plotWidth = width - TREND_PADDING.left - TREND_PADDING.right;
  const plotHeight = TREND_HEIGHT - TREND_PADDING.top - TREND_PADDING.bottom;
  const xOf = (index: number) => TREND_PADDING.left + (plotWidth * index) / (weeks.length - 1);
  const yOf = (value: number) => TREND_PADDING.top + plotHeight * (1 - value);
  const points = weeks.map((week, i) => (week.accuracy === null ? null : { x: xOf(i), y: yOf(week.accuracy) }));
  const lastIndex = weeks.indexOf(last);

  const svg = svgElement('svg', {
    width,
    height: TREND_HEIGHT,
    viewBox: `0 0 ${width} ${TREND_HEIGHT}`,
    class: 'trend',
    role: 'group',
    'aria-label': `Weekly accuracy over the last ${TREND_WEEKS} weeks, latest ${percent(last.accuracy ?? 0)}`,
  });

  [0, 0.5, 1].forEach(value => {
    svg.append(
      svgElement('line', {
        x1: TREND_PADDING.left,
        x2: width - TREND_PADDING.right,
        y1: yOf(value),
        y2: yOf(value),
        class: 'chart-grid',
      }),
    );
    const label = svgElement('text', {
      x: TREND_PADDING.left - 8,
      y: yOf(value) + 4,
      class: 'chart-axis-label tick-y',
    });
    label.textContent = percent(value);
    svg.append(label);
  });

  [0, Math.floor((weeks.length - 1) / 2), weeks.length - 1].forEach(index => {
    const label = svgElement('text', {
      x: xOf(index),
      y: TREND_HEIGHT - 6,
      class: `chart-axis-label tick-x${index === 0 ? ' start' : index === weeks.length - 1 ? ' end' : ''}`,
    });
    label.textContent = index === weeks.length - 1 ? 'This week' : shortDate(weeks[index]?.start ?? '');
    svg.append(label);
  });

  svg.append(svgElement('path', { d: linePath(points), class: 'trend-line' }));
  points.forEach((point, i) => {
    const isolated = point && !points[i - 1] && !points[i + 1];
    if (point && (isolated || i === lastIndex)) {
      svg.append(svgElement('circle', { cx: point.x, cy: point.y, r: 4, class: 'trend-point' }));
    }
  });
  const endLabel = svgElement('text', {
    x: xOf(lastIndex) + 9,
    y: yOf(last.accuracy ?? 0) + 4,
    class: 'chart-value-label',
  });
  endLabel.textContent = percent(last.accuracy ?? 0);
  svg.append(endLabel);

  const crosshair = svgElement('line', {
    y1: TREND_PADDING.top,
    y2: TREND_PADDING.top + plotHeight,
    class: 'chart-crosshair',
    visibility: 'hidden',
  });
  const overlay = svgElement('rect', {
    x: TREND_PADDING.left - 12,
    y: 0,
    width: plotWidth + 24,
    height: TREND_HEIGHT,
    class: 'chart-overlay',
    tabindex: 0,
    role: 'slider',
    'aria-label': 'Week to read. Use the left and right arrow keys.',
    'aria-valuemin': 0,
    'aria-valuemax': weeks.length - 1,
    'aria-valuenow': lastIndex,
    'aria-valuetext': `This week: ${percent(last.accuracy ?? 0)}`,
  });
  svg.append(crosshair, overlay);

  setHtml(container, [html`<div class="chart-frame"></div>`, table]);
  const frame = container.querySelector<HTMLElement>('.chart-frame');
  if (!frame) return;
  frame.append(svg);
  const tooltip = createTooltip(frame);
  let focusIndex = lastIndex;

  const showWeek = (index: number) => {
    focusIndex = Math.max(0, Math.min(weeks.length - 1, index));
    const week = weeks[focusIndex];
    if (!week) return;
    const x = xOf(focusIndex);
    crosshair.setAttribute('x1', String(x));
    crosshair.setAttribute('x2', String(x));
    crosshair.setAttribute('visibility', 'visible');
    overlay.setAttribute('aria-valuenow', String(focusIndex));
    overlay.setAttribute(
      'aria-valuetext',
      `Week of ${shortDate(week.start)}: ${week.accuracy === null ? 'no answers' : percent(week.accuracy)}`,
    );
    tooltip.show(
      { x, y: week.accuracy === null ? TREND_PADDING.top + plotHeight / 2 : yOf(week.accuracy) },
      week.accuracy === null ? 'No answers' : percent(week.accuracy),
      `Week of ${shortDate(week.start)}`,
      week.scored ? `${week.correct} of ${week.scored} right` : '',
    );
  };
  const hide = () => {
    crosshair.setAttribute('visibility', 'hidden');
    tooltip.hide();
  };

  overlay.addEventListener('pointermove', event => {
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    showWeek(Math.round(((x - TREND_PADDING.left) / plotWidth) * (weeks.length - 1)));
  });
  overlay.addEventListener('pointerleave', hide);
  overlay.addEventListener('focus', () => showWeek(focusIndex));
  overlay.addEventListener('blur', hide);
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    showWeek(focusIndex + (event.key === 'ArrowRight' ? 1 : -1));
  });
}
