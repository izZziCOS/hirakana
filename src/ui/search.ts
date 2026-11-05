import { kanjiLoaded } from '../kana.ts';
import { loadKanji } from '../kanji-loader.ts';
import { searchItems, SEARCH_LIMIT } from '../search.ts';
import type { KanaItem } from '../types.ts';
import type { KanaDialog } from './dialog.ts';
import { $, onDelegate, sizeClass } from './dom.ts';
import { html, setHtml, type Html } from './html.ts';
import { GROUP_LABEL } from './labels.ts';

export interface SearchView {
  close(): void;
}

function resultRow(item: KanaItem): Html {
  const title = item.cloze ? item.row : (item.kanji ?? item.kana);
  const reading = item.cloze ? item.cloze.point.pattern : item.kanji ? item.kana : item.romaji;
  const meaning = item.cloze ? item.cloze.point.meaning : item.meaning;
  return html`<li>
    <button type="button" class="search-result" data-open="${item.id}">
      <span class="search-title jp ${sizeClass(title)}" lang="ja">${title}</span>
      <span class="search-text">
        <span class="search-reading">${reading}</span>
        ${meaning && html`<span class="muted small search-meaning">${meaning}</span>`}
      </span>
      <span class="muted small search-group">${GROUP_LABEL[item.group]}</span>
    </button>
  </li>`;
}

export function createSearch(dialog: KanaDialog): SearchView {
  const panel = $('#search-dialog', HTMLDialogElement);
  const input = $('#search-input', HTMLInputElement);
  const results = $('#search-results');
  const status = $('#search-status');

  function render(): void {
    const query = input.value;
    const found = searchItems(query);
    setHtml(results, found.map(resultRow));
    status.textContent = !query.trim()
      ? 'Type a character, a reading or a meaning, such as 水, mizu or water.'
      : !found.length
        ? 'Nothing found.'
        : found.length >= SEARCH_LIMIT
          ? `The first ${SEARCH_LIMIT} matches.`
          : `${found.length} ${found.length === 1 ? 'match' : 'matches'}.`;
  }

  function open(): void {
    panel.showModal();
    input.select();
    render();
    // Kanji and the full word list are loaded in the background, and may not have arrived yet.
    if (!kanjiLoaded()) {
      loadKanji().then(render, () => {
        status.textContent = 'Kanji and the full word list couldn’t be loaded, so they aren’t searched.';
      });
    }
  }

  $('#search-btn').addEventListener('click', open);
  $('#search-close').addEventListener('click', () => panel.close());
  panel.addEventListener('click', event => {
    if (event.target === panel) panel.close();
  });
  input.addEventListener('input', render);
  $('#search-form').addEventListener('submit', event => {
    event.preventDefault();
    results.querySelector<HTMLButtonElement>('.search-result')?.click();
  });
  onDelegate(results, '[data-open]', element => dialog.open(element.dataset.open ?? ''));

  document.addEventListener('keydown', event => {
    const target = event.target as Element;
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (target.matches('input, textarea') || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    open();
  });

  return { close: () => panel.close() };
}
