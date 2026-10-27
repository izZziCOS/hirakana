import { GROUPS, TRACKS } from '../data.ts';
import { dayStreak } from '../days.ts';
import { isKanjiGroup, KANA, kanjiLoaded, ROW_INFO } from '../kana.ts';
import { groupRecall } from '../milestones.ts';
import { singleDirection, todaySummary, type TodaySummary } from '../session.ts';
import {
  backupDue,
  backupStatus,
  combinedDays,
  groupProgress,
  groupSelection,
  rowsSummary,
  toggleGroup,
  toggleRow,
} from '../state.ts';
import type { AppStores } from '../store.ts';
import type { Group, GroupId, RowInfo, Settings, State, Track } from '../types.ts';
import { $, onDelegate } from './dom.ts';
import { html, setHtml, type Html } from './html.ts';
import { DIRECTION_LABEL } from './labels.ts';

const PRESSED = { all: 'true', some: 'mixed', none: 'false' } as const;

export interface Home {
  render(): void;
}

const percent = (part: number, total: number): number => (total ? Math.round((part / total) * 100) : 0);
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

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

// Kanji levels have up to 42 rows each, so their chips stay hidden until the level is opened.
function groupRows(group: Group, settings: Settings, openLevels: Set<string>): Html {
  const rows = ROW_INFO.filter(row => row.group === group.id);
  const chips = html`<div class="row-chips">${rows.map(row => rowChip(row, settings))}</div>`;
  if (!isKanjiGroup(group.id)) {
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
  return mastered ? `${percent(mastered, total)}% mastered${remembered}` : `${total.toLocaleString('en')} cards`;
}

export function trackCard(track: Track, state: State, open = false, openLevels = new Set<string>()): Html {
  const groups = GROUPS.filter(group => track.groups.includes(group.id));
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
        <p class="muted small">${track.summary} · ${cards.toLocaleString('en')} cards</p>
      </div>
    </div>
    <div class="track-bar" role="img" aria-label="${share}% mastered">
      <span style="width: ${share}%"></span>
    </div>
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
    <button type="button" class="ghost track-open" data-track="${track.id}" aria-expanded="${String(open)}">
      ${open ? 'Hide rows' : 'Choose rows'}
    </button>
    ${open && html`<div class="track-rows">${groups.map(group => groupRows(group, state.settings, openLevels))}</div>`}
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
      TRACKS.map(track => trackCard(track, state, openTracks.has(track.id), openLevels)),
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

  $('#backup-export').addEventListener('click', onExport);
  $('#backup-later').addEventListener('click', () => {
    backupSnoozed = true;
    render();
  });

  data.subscribe(render);
  session.subscribe(render);
  return { render };
}
