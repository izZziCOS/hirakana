import { GROUPS, TRACKS } from '../data.ts';
import { dayStreak } from '../days.ts';
import { deckChanges, deckNameOf, newDeckId, parseDeck } from '../decks.ts';
import { isKanjiGroup, KANA, kanjiLoaded, ROW_INFO } from '../kana.ts';
import { groupRecall } from '../milestones.ts';
import { singleDirection, todaySummary, type TodaySummary } from '../session.ts';
import {
  addDeck,
  backupDue,
  backupStatus,
  combinedDays,
  deckProgress,
  deleteDeck,
  type DeckProgress,
  updateDeck,
  groupProgress,
  groupSelection,
  rowsSummary,
  toggleGroup,
  toggleRow,
} from '../state.ts';
import type { AppStores } from '../store.ts';
import type { Deck, Group, GroupId, RowInfo, Settings, State, Track } from '../types.ts';
import { chooseAction, confirmAction } from './confirm.ts';
import { $, onDelegate } from './dom.ts';
import { html, setHtml, type Html } from './html.ts';
import { DIRECTION_LABEL } from './labels.ts';

const PRESSED = { all: 'true', some: 'mixed', none: 'false' } as const;

export interface Home {
  render(): void;
}

const percent = (part: number, total: number): number => (total ? Math.round((part / total) * 100) : 0);
const plural = (count: number, word: string): string =>
  `${count.toLocaleString('en')} ${word}${count === 1 ? '' : 's'}`;

export function heroCopy({ due, newLeft }: TodaySummary): { title: string; action: string } {
  if (!due && !newLeft) return { title: 'All caught up for now', action: 'Practise anyway' };
  const parts = [due ? `${plural(due, 'review')} due` : '', newLeft ? `${newLeft} new to learn` : ''];
  return { title: parts.filter(Boolean).join(', '), action: 'Continue' };
}

export const heroDetail = (state: State): string =>
  `${DIRECTION_LABEL[state.settings.direction]} · ${rowsSummary(state)}`;

function rowChip(row: RowInfo, settings: Settings): Html {
  const { script, rows } = settings;
  const available = script === 'both' || Boolean(row.preview[script] ?? row.preview.kanji);
  const preview =
    (script === 'both' ? undefined : row.preview[script]) ??
    row.preview.hiragana ??
    row.preview.katakana ??
    row.preview.kanji ??
    '';
  const title = available ? row.label : `${row.label} (not in ${script})`;
  return html`<button
    class="row-chip jp"
    data-row="${row.id}"
    aria-pressed="${String(rows.includes(row.id))}"
    title="${title}"
    ${available ? '' : html`disabled`}
  >
    ${preview}
  </button>`;
}

// Sets with more rows than this (each kanji level, and each JLPT word level once the full list has loaded) keep their
// chips hidden until the set is opened.
export const MAX_OPEN_ROWS = 12;

function groupRows(group: Group, settings: Settings, openLevels: Set<string>): Html {
  const rows = ROW_INFO.filter(row => row.group === group.id);
  const chips = html`<div class="row-chips">${rows.map(row => rowChip(row, settings))}</div>`;
  if (!isKanjiGroup(group.id) && rows.length <= MAX_OPEN_ROWS) {
    return html`<div class="row-group">
      <div class="row-group-head">${group.label}</div>
      ${chips}
    </div>`;
  }
  const open = openLevels.has(group.id);
  const selected = rows.filter(row => settings.rows.includes(row.id)).length;
  return html`<div class="row-group">
    <button
      type="button"
      class="row-group-head row-group-toggle"
      data-expand="${group.id}"
      aria-expanded="${String(open)}"
    >
      ${group.label} <span class="row-group-count">${selected}/${rows.length} rows</span>
    </button>
    ${open && chips}
  </div>`;
}

function groupStatus(state: State, groupId: GroupId): string {
  if (isKanjiGroup(groupId) && !kanjiLoaded()) return 'Loading…';
  const { mastered, total } = groupProgress(state, groupId);
  if (!total) return `Not in ${DIRECTION_LABEL[state.settings.direction]}`;
  const recall = groupRecall(state.stats, groupId, singleDirection(state.settings.direction));
  const remembered = recall === null ? '' : ` · ${recall}% remembered`;
  if (mastered === total) return `Mastered${remembered}`;
  return mastered ? `${percent(mastered, total)}% mastered${remembered}` : plural(total, 'card');
}

// The decks card lists the imported decks and takes new ones; deckStatus says how the last import went.
// "40 words · 12 mastered · 8 learning · 3 due", or that nothing has been practised yet.
export function deckSummary({ direction, total, mastered, learning, due }: DeckProgress, practised: string): string {
  const words = plural(total, 'word');
  const where = direction === practised ? '' : ` in ${DIRECTION_LABEL[direction]}`;
  if (!mastered && !learning) return `${words} · not started${where}`;
  const parts = [words, `${mastered} mastered`, `${learning} learning`, due ? `${due} due` : ''];
  return parts.filter(Boolean).join(' · ') + where;
}

function deckItem(state: State, deck: Deck, now: number): Html {
  const progress = deckProgress(state, deck, now);
  const mastered = percent(progress.mastered, progress.total);
  const learning = percent(progress.learning, progress.total);
  const practised = singleDirection(state.settings.direction);
  return html`<li>
    <div class="deck-info">
      <span class="deck-name">${deck.name}</span>
      <span class="muted small">${deckSummary(progress, practised)}</span>
      <div class="deck-bar" role="img" aria-label="${mastered}% mastered, ${learning}% learning">
        <span class="deck-bar-mastered" style="width: ${mastered}%"></span
        ><span class="deck-bar-learning" style="width: ${learning}%"></span>
      </div>
    </div>
    <button type="button" class="ghost small danger" data-delete-deck="${deck.id}">Delete</button>
  </li>`;
}

function deckTools(state: State, deckStatus: string, now: number): Html {
  return html`<div class="deck-tools">
    ${
      state.decks.length > 0 &&
      html`<ul class="deck-list">
        ${state.decks.map(deck => deckItem(state, deck, now))}
      </ul>`
    }
    <button type="button" class="ghost" data-import-deck>Import a word list</button>
    <p class="muted small">
      A CSV or tab-separated file, such as an Anki deck exported as “Notes in Plain Text”. Each line needs the word in
      kana and its meaning in English; a kanji spelling is optional. Decks are practised in Read, Listen, Meaning and
      Recall.
    </p>
    <p class="small deck-status" aria-live="polite">${deckStatus}</p>
  </div>`;
}

export function trackCard(
  track: Track,
  state: State,
  open = false,
  openLevels = new Set<string>(),
  deckStatus = '',
  now = Date.now(),
): Html {
  // Without any decks the decks card only offers to import one.
  const empty = track.id === 'decks' && !state.decks.length;
  const groups = empty ? [] : GROUPS.filter(group => track.groups.includes(group.id));
  const progress = groups.map(group => groupProgress(state, group.id));
  const mastered = progress.reduce((sum, p) => sum + p.mastered, 0);
  const total = progress.reduce((sum, p) => sum + p.total, 0);
  const cards = KANA.filter(item => track.groups.includes(item.group)).length;
  const share = percent(mastered, total);
  return html`<article class="track" aria-labelledby="track-${track.id}">
    <div class="track-head">
      <span class="track-glyph track-${track.id} jp" aria-hidden="true">${track.glyph}</span>
      <div>
        <h3 id="track-${track.id}">${track.label}</h3>
        <p class="muted small">${track.summary} · ${plural(cards, 'card')}</p>
      </div>
    </div>
    ${
      !empty &&
      html`<div class="track-bar" role="img" aria-label="${share}% mastered">
        <span style="width: ${share}%"></span>
      </div>`
    }
    <ul class="track-groups">
      ${groups.map(
        group =>
          html`<li>
            <button
              type="button"
              class="track-group"
              data-group="${group.id}"
              aria-pressed="${PRESSED[groupSelection(state, group.id)]}"
            >
              <span class="track-check" aria-hidden="true"></span>
              <span class="track-group-name">${group.label} <span class="jp muted">${group.hint}</span></span>
              <span class="track-group-status">${groupStatus(state, group.id)}</span>
            </button>
          </li>`,
      )}
    </ul>
    ${
      !empty &&
      html`<button type="button" class="ghost track-open" data-track="${track.id}" aria-expanded="${String(open)}">
        ${open ? 'Hide rows' : 'Choose rows'}
      </button>`
    }
    ${open && html`<div class="track-rows">${groups.map(group => groupRows(group, state.settings, openLevels))}</div>`}
    ${track.id === 'decks' && deckTools(state, deckStatus, now)}
  </article>`;
}

export function createHome({ data, session }: AppStores, isVisible: () => boolean, onExport: () => void): Home {
  const els = {
    title: $('#hero-title'),
    detail: $('#hero-detail'),
    continueLabel: $('#continue-label'),
    tracks: $('#track-grid'),
    streak: $('#streak'),
    backup: $('#backup-note'),
    backupDetail: $('#backup-note-detail'),
  };
  const openTracks = new Set<string>();
  const openLevels = new Set<string>();
  const deckFile = $('#deck-file', HTMLInputElement);
  let deckStatus = '';
  // "Not now" hides the backup reminder until the next visit.
  let backupSnoozed = false;

  function render(): void {
    const state = data.get();
    const now = Date.now();
    const streak = dayStreak(combinedDays(state), now);
    els.streak.hidden = !streak;
    els.streak.textContent = `${streak}-day streak`;
    if (!isVisible()) return;
    const copy = heroCopy(todaySummary(state, session.get(), now));
    els.title.textContent = copy.title;
    els.continueLabel.textContent = copy.action;
    els.detail.textContent = heroDetail(state);
    els.backup.hidden = backupSnoozed || !backupDue(state, now);
    els.backupDetail.textContent = `${backupStatus(state, now)} This browser can clear saved data, so keep a copy.`;
    setHtml(
      els.tracks,
      TRACKS.map(track => trackCard(track, state, openTracks.has(track.id), openLevels, deckStatus)),
    );
  }

  const toggle = (set: Set<string>, key: string) => {
    if (!set.delete(key)) set.add(key);
    render();
  };

  onDelegate(els.tracks, 'button[data-group]', button =>
    data.update(state => toggleGroup(state, button.dataset.group as GroupId)),
  );
  onDelegate(els.tracks, 'button[data-row]', button =>
    data.update(state => toggleRow(state, button.dataset.row ?? '')),
  );
  onDelegate(els.tracks, 'button[data-track]', button => toggle(openTracks, button.dataset.track ?? ''));
  onDelegate(els.tracks, 'button[data-expand]', button => toggle(openLevels, button.dataset.expand ?? ''));

  function setDeckStatus(text: string): void {
    deckStatus = text;
    render();
  }

  async function importDeck(file: File): Promise<void> {
    const { words, skipped } = parseDeck(await file.text());
    const ignored = skipped
      ? ` ${plural(skipped, 'line')} without a kana word and a meaning ${skipped === 1 ? 'was' : 'were'} left out.`
      : '';
    if (!words.length) {
      setDeckStatus(`No words found in ${file.name}. Each line needs a word in kana and its meaning.`);
      return;
    }
    const state = data.get();
    const name = deckNameOf(file.name);
    // A file named like a deck already here is most likely a new version of it.
    const existing = state.decks.find(deck => deck.name === name);
    const choice = existing
      ? await chooseAction({
          title: `Update “${name}”?`,
          message:
            `You already have a deck called “${name}”. Updating it keeps your progress on the words that are still in ` +
            'the file and removes the others. Adding it as a new deck keeps both.',
          confirmLabel: 'Update',
          altLabel: 'Add as new',
        })
      : 'alt';
    if (choice === 'cancel') return;
    if (existing && choice === 'confirm') {
      const { added, removed } = deckChanges(existing.words, words);
      data.update(current => updateDeck(current, existing.id, words));
      setDeckStatus(
        `Updated “${name}”: ${plural(words.length, 'word')}, ${added} new and ${removed} removed.${ignored}`,
      );
      return;
    }
    const used = new Set([...state.decks.map(deck => deck.id), ...Object.keys(state.deletedDecks)]);
    let id = newDeckId();
    while (used.has(id)) id = newDeckId();
    const now = Date.now();
    data.update(current => addDeck(current, { id, name, words, addedAt: now, updatedAt: now }));
    setDeckStatus(`Added “${name}” with ${plural(words.length, 'word')}.${ignored}`);
  }

  async function removeDeck(deck: Deck): Promise<void> {
    const confirmed = await confirmAction({
      title: `Delete “${deck.name}”?`,
      message: `Its ${plural(deck.words.length, 'word')} and your progress on them will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete deck',
      danger: true,
    });
    if (!confirmed) return;
    data.update(state => deleteDeck(state, deck.id));
    setDeckStatus(`Deleted “${deck.name}”.`);
  }

  onDelegate(els.tracks, 'button[data-import-deck]', () => deckFile.click());
  onDelegate(els.tracks, 'button[data-delete-deck]', button => {
    const deck = data.get().decks.find(candidate => candidate.id === button.dataset.deleteDeck);
    if (deck) void removeDeck(deck);
  });
  deckFile.addEventListener('change', () => {
    const file = deckFile.files?.[0];
    if (!file) return;
    importDeck(file)
      .catch((error: unknown) => setDeckStatus(error instanceof Error ? error.message : 'That file couldn’t be read.'))
      .finally(() => {
        deckFile.value = '';
      });
  });

  $('#backup-export').addEventListener('click', onExport);
  $('#backup-later').addEventListener('click', () => {
    backupSnoozed = true;
    render();
  });

  data.subscribe(render);
  session.subscribe(render);
  return { render };
}
