import { GROUPS, TRACKS } from '../data.ts';
import { dayStreak } from '../days.ts';
import { deckChanges, deckNameOf, newDeckId, parseDeck } from '../decks.ts';
import { spellingOf } from '../examples.ts';
import {
  DIRECTIONS,
  inScript,
  isGrammarGroup,
  isKanjiGroup,
  KANA,
  kanjiLoaded,
  ROW_INFO,
  supportsDirection,
  toKatakana,
} from '../kana.ts';
import { groupRecall } from '../milestones.ts';
import { backlog, catchUp, resetCard, singleDirection, todaySummary, type TodaySummary } from '../session.ts';
import { catchUpPlan } from '../schedule.ts';
import {
  addDeck,
  backupDue,
  backupStatus,
  combinedDays,
  deckProgress,
  deleteDeck,
  directionOfGroup,
  type DeckProgress,
  type GroupProgress,
  updateDeck,
  groupProgress,
  groupSelection,
  itemsProgress,
  rowsSummary,
  savedItems,
  toggleGroup,
  toggleRow,
} from '../state.ts';
import type { AppStores } from '../store.ts';
import type { Deck, Group, GroupId, RowInfo, ScriptSetting, Settings, State, Track } from '../types.ts';
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

export function heroCopy({ due, newLeft }: Pick<TodaySummary, 'due' | 'newLeft'>): { title: string; action: string } {
  if (!due && !newLeft) return { title: 'All caught up for now', action: 'Practise anyway' };
  const parts = [due ? `${plural(due, 'review')} due` : '', newLeft ? `${newLeft} new to learn` : ''];
  return { title: parts.filter(Boolean).join(', '), action: 'Continue' };
}

export interface CatchUpCopy {
  title: string;
  detail: string;
  action: string;
}

// The offer to spread a backlog of reviews over the next few days.
export function catchUpCopy(count: number, perDay: number): CatchUpCopy {
  const { daily, days } = catchUpPlan(count, perDay);
  return {
    title: `${plural(count, 'review')} due`,
    detail:
      `That’s a lot for one day. Catch up over ${days} days instead: about ${daily} a day, the cards you know least ` +
      'first, while the rest wait for their day. New cards keep their daily limit.',
    action: `Spread over ${days} days`,
  };
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

// Green for mastered, then amber for learning, in the colours of the progress grid.
function progressBar(size: string, { mastered, learning, total }: GroupProgress): Html {
  const masteredShare = percent(mastered, total);
  const learningShare = percent(learning, total);
  return html`<div
    class="progress-bar ${size}"
    role="img"
    aria-label="${masteredShare}% mastered, ${learningShare}% learning"
  >
    <span class="progress-mastered" style="width: ${masteredShare}%"></span
    ><span class="progress-learning" style="width: ${learningShare}%"></span>
  </div>`;
}

// A set with no cards in the picked direction says where it is practised when that is a single mode: grammar and
// conjugation are only filled in.
function practisedOnlyIn(groupId: GroupId, script: ScriptSetting): string | null {
  const items = KANA.filter(item => item.group === groupId && inScript(item, script));
  const ways = DIRECTIONS.filter(direction => items.some(item => supportsDirection(item, direction)));
  const [only] = ways;
  return ways.length === 1 && only ? `${DIRECTION_LABEL[only]} only` : null;
}

function groupStatus(state: State, groupId: GroupId, { mastered, learning, total }: GroupProgress): string {
  // Grammar past N4 and the conjugation forms load with the kanji.
  const onDemand = isKanjiGroup(groupId) || (isGrammarGroup(groupId) && groupId !== 'g5' && groupId !== 'g4');
  if (onDemand && !kanjiLoaded()) return 'Loading…';
  if (!total)
    return practisedOnlyIn(groupId, state.settings.script) ?? `No ${DIRECTION_LABEL[state.settings.direction]} cards`;
  const recall = groupRecall(
    state.stats,
    groupId,
    directionOfGroup(state.settings.direction, groupId),
    state.settings.script,
  );
  const remembered = recall === null ? '' : ` · ${recall}% remembered`;
  if (mastered === total) return `Mastered${remembered}`;
  if (mastered) return `${percent(mastered, total)}% mastered${remembered}`;
  return learning ? `${learning} of ${plural(total, 'card')} started${remembered}` : plural(total, 'card');
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
  const practised = singleDirection(state.settings.direction);
  return html`<li>
    <div class="deck-info">
      <span class="deck-name">${deck.name}</span>
      <span class="muted small">${deckSummary(progress, practised)}</span>
      ${progressBar('deck-bar', progress)}
    </div>
    <button type="button" class="ghost small danger" data-delete-deck="${deck.id}">Delete</button>
  </li>`;
}

// Words saved from the Read tab are practised whatever is picked here; each can be let go from its details panel.
function savedItem(state: State, now: number): Html | null {
  const items = savedItems(state);
  if (!items.length) return null;
  const progress = itemsProgress(state, items, now);
  const practised = singleDirection(state.settings.direction);
  const examples = items.slice(0, 6).map(item => spellingOf(item) ?? item.kana);
  return html`<li>
    <div class="deck-info">
      <span class="deck-name">Saved from reading</span>
      <span class="muted small">${deckSummary(progress, practised)} · always practised</span>
      <span class="small jp saved-examples" lang="ja">${examples.join('、')}${items.length > 6 ? '…' : ''}</span>
      ${progressBar('deck-bar', progress)}
    </div>
  </li>`;
}

function deckTools(state: State, deckStatus: string, now: number): Html {
  const saved = savedItem(state, now);
  return html`<div class="deck-tools">
    ${
      (state.decks.length > 0 || saved) &&
      html`<ul class="deck-list">
        ${saved}${state.decks.map(deck => deckItem(state, deck, now))}
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

const KANA_SUMMARY: Record<ScriptSetting, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  both: 'Hiragana & katakana',
};

// The kana track is written in the script that is picked: ア and ア–ン once katakana is.
function inPickedScript(track: Track, groups: Group[], script: ScriptSetting): { track: Track; groups: Group[] } {
  if (track.id !== 'kana') return { track, groups };
  const write = (text: string) => (script === 'katakana' ? toKatakana(text) : text);
  return {
    track: { ...track, glyph: write(track.glyph), summary: KANA_SUMMARY[script] },
    groups: groups.map(group => ({ ...group, label: write(group.label), hint: write(group.hint) })),
  };
}

// A set with no cards in the picked script, such as loanword katakana with hiragana picked, is left out. Kanji that
// haven't loaded yet are still shown.
const hasCardsIn = (group: Group, script: ScriptSetting): boolean => {
  const items = KANA.filter(item => item.group === group.id);
  return !items.length || items.some(item => inScript(item, script));
};

export function trackCard(
  track: Track,
  state: State,
  open = false,
  openLevels = new Set<string>(),
  deckStatus = '',
  now = Date.now(),
  shown?: boolean,
): Html {
  const { script } = state.settings;
  // Without any decks the decks card only offers to import one.
  const empty = track.id === 'decks' && !state.decks.length;
  const { track: display, groups } = inPickedScript(
    track,
    empty ? [] : GROUPS.filter(group => track.groups.includes(group.id) && hasCardsIn(group, script)),
    script,
  );
  const sets = groups.map(group => ({ group, progress: groupProgress(state, group.id) }));
  const sum = (key: keyof GroupProgress) => sets.reduce((total, set) => total + set.progress[key], 0);
  const trackProgress = { mastered: sum('mastered'), learning: sum('learning'), total: sum('total') };
  const cards = KANA.filter(item => track.groups.includes(item.group) && inScript(item, script)).length;
  // A track with nothing turned on folds down to its heading, unless it was opened.
  const collapsible = track.id !== 'decks';
  const expanded = !collapsible || (shown ?? (open || isTrackActive(state, track)));
  const started = trackProgress.mastered + trackProgress.learning > 0;
  return html`<article class="track${expanded ? '' : ' is-collapsed'}" aria-labelledby="track-${track.id}">
    <div class="track-head">
      <span class="track-glyph track-${track.id} jp" aria-hidden="true">${display.glyph}</span>
      <div class="track-title">
        <h3 id="track-${track.id}">${track.label}</h3>
        <p class="muted small">${display.summary} · ${plural(cards, 'card')}</p>
      </div>
      ${
        collapsible &&
        html`<button
          type="button"
          class="ghost small track-toggle"
          data-show-track="${track.id}"
          aria-expanded="${String(expanded)}"
        >
          ${expanded ? 'Hide sets' : `Show ${plural(sets.length, 'set')}`}
        </button>`
      }
    </div>
    ${!empty && (expanded || started) && progressBar('track-bar', trackProgress)}
    ${!expanded ? '' : trackBody(track, state, sets, groups, open, openLevels, empty)}
    ${track.id === 'decks' && deckTools(state, deckStatus, now)}
  </article>`;
}

// Whether any set in a track is turned on.
export const isTrackActive = (state: State, track: Track): boolean =>
  track.groups.some(group => groupSelection(state, group) !== 'none');

function trackBody(
  track: Track,
  state: State,
  sets: { group: Group; progress: GroupProgress }[],
  groups: Group[],
  open: boolean,
  openLevels: Set<string>,
  empty: boolean,
): Html {
  return html` <ul class="track-groups">
      ${sets.map(
        ({ group, progress }) =>
          html`<li>
            <button
              type="button"
              class="track-group"
              data-group="${group.id}"
              aria-pressed="${PRESSED[groupSelection(state, group.id)]}"
            >
              <span class="track-check" aria-hidden="true"></span>
              <span class="track-group-name">${group.label} <span class="jp muted">${group.hint}</span></span>
              <span class="track-group-status">${groupStatus(state, group.id, progress)}</span>
              ${progress.total > 0 && progressBar('set-bar', progress)}
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
    ${open && html`<div class="track-rows">${groups.map(group => groupRows(group, state.settings, openLevels))}</div>`}`;
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
    catchUp: $('#catch-up-note'),
    catchUpTitle: $('#catch-up-title'),
    catchUpDetail: $('#catch-up-detail'),
    catchUpSpread: $('#catch-up-spread', HTMLButtonElement),
  };
  const openTracks = new Set<string>();
  // Tracks opened or folded by hand this visit; the others are open while a set in them is turned on.
  const shownTracks = new Map<string, boolean>();
  const openLevels = new Set<string>();
  const deckFile = $('#deck-file', HTMLInputElement);
  let deckStatus = '';
  // "Not now" hides the backup reminder until the next visit.
  let backupSnoozed = false;
  // Likewise the offer to catch up.
  let catchUpSnoozed = false;

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
    const overdue = catchUpSnoozed ? 0 : backlog(state, now);
    els.catchUp.hidden = !overdue;
    if (overdue) {
      const catchUpText = catchUpCopy(overdue, state.settings.reviewsPerDay);
      els.catchUpTitle.textContent = catchUpText.title;
      els.catchUpDetail.textContent = catchUpText.detail;
      els.catchUpSpread.textContent = catchUpText.action;
    }
    setHtml(
      els.tracks,
      TRACKS.map(track =>
        trackCard(track, state, openTracks.has(track.id), openLevels, deckStatus, now, shownTracks.get(track.id)),
      ),
    );
  }

  const toggle = (set: Set<string>, key: string) => {
    if (!set.delete(key)) set.add(key);
    render();
  };

  onDelegate(els.tracks, 'button[data-group]', button => {
    const groupId = button.dataset.group as GroupId;
    // Turning off the last set in a track leaves it open rather than folding it away under the pointer.
    const track = TRACKS.find(candidate => candidate.groups.includes(groupId));
    if (track) shownTracks.set(track.id, true);
    data.update(state => toggleGroup(state, groupId));
  });
  onDelegate(els.tracks, 'button[data-show-track]', button => {
    const id = button.dataset.showTrack ?? '';
    const track = TRACKS.find(candidate => candidate.id === id);
    if (!track) return;
    shownTracks.set(id, !(shownTracks.get(id) ?? (openTracks.has(id) || isTrackActive(data.get(), track))));
    render();
  });
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
  els.catchUpSpread.addEventListener('click', () => {
    // The card on screen may be one of the reviews that just moved.
    session.update(resetCard);
    data.update(state => catchUp(state, Date.now()));
  });
  $('#catch-up-later').addEventListener('click', () => {
    catchUpSnoozed = true;
    render();
  });
  $('#backup-later').addEventListener('click', () => {
    backupSnoozed = true;
    render();
  });

  data.subscribe(render);
  session.subscribe(render);
  return { render };
}
