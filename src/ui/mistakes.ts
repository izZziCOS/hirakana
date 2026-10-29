import { findKana, getKana, isWord, kanaForAnswer } from '../kana.ts';
import { dateOf } from '../days.ts';
import { parseWritingAnswer } from '../handwriting.ts';
import { confusionPairs, mistakesOnDay, mostMissed, type MixUpPair } from '../mistakes.ts';
import { DRILL_SIZE } from '../session.ts';
import type { AppStores } from '../store.ts';
import type { KanaItem, Mistake, Script } from '../types.ts';
import type { KanaDialog } from './dialog.ts';
import { $, jp, onDelegate, onSegmented, press, sizeClass } from './dom.ts';
import { clozeMarkup, shortLabel } from './grammar.ts';
import { html, setHtml, type Html } from './html.ts';
import { DIRECTION_LABEL, SCRIPT_LABEL } from './labels.ts';

const MAX_LISTED = 300;

export interface MistakesView {
  render(): void;
  showDay(day: string): void;
}

function dayLabel(timestamp: number): string {
  const day = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function picked(given: string): Html {
  const item = findKana(given);
  return html`<span class="given">${jp(given)}</span>${item && html` <span class="muted">(${item.romaji})</span>`}`;
}

function mistakeLine(mistake: Mistake, item: KanaItem): Html {
  if (mistake.direction === 'cloze') {
    return html`${clozeMarkup(item, null, true)} ·
    ${
      mistake.given
        ? html`you answered <span class="given">${jp(mistake.given)}</span>`
        : html`<span class="muted">skipped</span>`
    }`;
  }
  if (!mistake.given) {
    const prompt = mistake.direction !== 'recall' ? jp(item.kana) : isWord(item) ? `“${item.meaning}”` : item.romaji;
    return html`${prompt} · <span class="muted">skipped</span>`;
  }
  if (mistake.direction === 'recall' && isWord(item)) {
    return html`Recall <strong>“${item.meaning}”</strong> → ${jp(item.kana)} · you answered ${picked(mistake.given)}`;
  }
  if (mistake.direction === 'recall') {
    return html`Recall <strong>${item.romaji}</strong> → ${jp(item.kana)} · you answered ${picked(mistake.given)}`;
  }
  if (mistake.direction === 'match') {
    return html`${jp(item.kana)} → <strong>${jp(item.counterpart ?? '')}</strong> · you picked ${picked(mistake.given)}`;
  }
  if (mistake.direction === 'write') {
    const written = parseWritingAnswer(mistake.given);
    return html`Write <strong>${jp(item.kana)}</strong> (${item.romaji})${
        written && html` · ${written.mistakes} of ${written.strokes} strokes retried`
      }`;
  }
  if (mistake.direction === 'meaning') {
    return html`${jp(item.kana)} means <strong>${item.meanings?.[0] ?? ''}</strong> · you said
      <span class="given">${mistake.given}</span>`;
  }
  const confusedWith = kanaForAnswer(mistake.given, item.script);
  return html`Answer <strong>${item.romaji}</strong> · you said
    <span class="nowrap"
      ><span class="given">${mistake.given}</span>${
        confusedWith && html` <span class="muted">(${jp(confusedWith.kana)})</span>`
      }</span
    >`;
}

function historyItems(mistakes: Mistake[]): Html[] {
  let lastDay = '';
  const listed = mistakes.slice(0, MAX_LISTED);
  const rows = listed.map(mistake => {
    const item = getKana(mistake.kana);
    const day = dayLabel(mistake.at);
    const header = day !== lastDay && html`<li class="day-head">${day}</li>`;
    lastDay = day;
    const time = new Date(mistake.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return html`${header}
      <li class="mistake">
        <button class="mistake-kana jp ${sizeClass(shortLabel(item))}" data-open="${item.id}" title="Show info">
          ${shortLabel(item)}
        </button>
        <div class="mistake-text">
          <div>${mistakeLine(mistake, item)}</div>
          <div class="muted small">
            ${SCRIPT_LABEL[item.script]} · ${item.row} · ${DIRECTION_LABEL[mistake.direction]}
          </div>
        </div>
        <time>${time}</time>
      </li>`;
  });
  if (mistakes.length > listed.length) {
    rows.push(html`<li class="muted small more">Showing the latest ${listed.length} of ${mistakes.length}.</li>`);
  }
  return rows;
}

const pairCard = ({ items: [a, b], count }: MixUpPair): Html =>
  html`<div class="pair-card">
    <div class="pair-kana">
      <button class="jp" data-open="${a.id}">${a.kana}</button><span class="pair-arrow">⇄</span
      ><button class="jp" data-open="${b.id}">${b.kana}</button>
    </div>
    <div class="pair-meta">${a.romaji} / ${b.romaji}<span class="count">×${count}</span></div>
    <button class="ghost small" data-pair="${a.id}|${b.id}">Drill</button>
  </div>`;

export function createMistakes(
  { data }: AppStores,
  dialog: KanaDialog,
  startDrill: (label: string, items: KanaItem[]) => void,
): MistakesView {
  const els = {
    mostMissed: $('#most-missed'),
    pairs: $('#pairs'),
    list: $('#mistake-list'),
    count: $('#mistake-count'),
    drillButton: $('#drill-btn', HTMLButtonElement),
    dayFilter: $('#day-filter'),
    dayFilterText: $('#day-filter-text'),
  };
  let filter: Script | 'all' = 'all';
  let day: string | null = null;

  const filtered = (): Mistake[] => {
    const all = day ? mistakesOnDay(data.get().mistakes, day) : data.get().mistakes;
    return all.filter(m => filter === 'all' || findKana(m.kana)?.script === filter);
  };

  function render(): void {
    const mistakes = filtered();
    const top = mostMissed(mistakes, DRILL_SIZE);
    const pairs = confusionPairs(mistakes);
    press('#mistake-filter', filter);
    els.dayFilter.hidden = !day;
    els.dayFilterText.textContent = day
      ? `Mistakes on ${dateOf(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`
      : '';

    setHtml(
      els.mostMissed,
      top.length
        ? top.map(
            ({ item, count }) =>
              html`<button class="missed-chip" data-open="${item.id}">
                ${jp(shortLabel(item))}<span class="missed-romaji">${item.romaji}</span
                ><span class="count">×${count}</span>
              </button>`,
          )
        : html`<p class="empty">${day ? 'No mistakes on this day.' : 'No mistakes yet. Go practise!'}</p>`,
    );
    els.drillButton.disabled = !top.length;
    setHtml(
      els.pairs,
      pairs.length
        ? pairs.map(pairCard)
        : html`<p class="empty">
            No mix-ups yet. When you confuse one character with another, the pair shows up here.
          </p>`,
    );
    els.count.textContent = mistakes.length ? `${mistakes.length} total` : '';
    setHtml(els.list, historyItems(mistakes));
  }

  onSegmented('#mistake-filter', value => {
    filter = value as Script | 'all';
    render();
  });

  els.drillButton.addEventListener('click', () => {
    const top = mostMissed(filtered(), DRILL_SIZE);
    if (!top.length) return;
    startDrill(
      `your ${top.length} most-missed characters`,
      top.map(entry => entry.item),
    );
  });

  [els.mostMissed, els.pairs, els.list].forEach(container => {
    onDelegate(container, '[data-pair], [data-open]', element => {
      if (element.dataset.pair) {
        const items = element.dataset.pair.split('|').map(getKana);
        startDrill(items.map(item => item.kana).join(' ⇄ '), items);
      } else if (element.dataset.open) {
        dialog.open(element.dataset.open);
      }
    });
  });

  $('#day-filter-clear').addEventListener('click', () => {
    day = null;
    render();
  });

  return {
    render,
    showDay(selected) {
      day = selected;
      render();
    },
  };
}
