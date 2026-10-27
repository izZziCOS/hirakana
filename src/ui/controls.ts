import { GROUPS } from '../data.ts';
import { isKanjiGroup, ROW_INFO } from '../kana.ts';
import { groupSelection, rowsSummary, toggleGroup, toggleRow, updateSettings } from '../state.ts';
import type { Store } from '../store.ts';
import type { Direction, GroupId, Mode, RowInfo, ScriptSetting, Settings, SpeedCheck, State } from '../types.ts';
import { $, onDelegate, onSegmented, press } from './dom.ts';
import { html, setHtml, type Html } from './html.ts';
import { hasJapaneseVoice } from './speech.ts';

const PRESSED = { all: 'true', some: 'mixed', none: 'false' } as const;

export interface Controls {
  render(): void;
}

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

export function createControls(data: Store<State>): Controls {
  const groupSelect = $('#group-select');
  const rowsBody = $('#rows-body');
  const rowsSummaryLabel = $('#rows-summary');
  const newSummary = $('#new-summary');
  const modeSelect = $('#mode-select');

  const set = (changes: Partial<Settings>) => data.update(state => updateSettings(state, changes));

  onSegmented('#direction-select', value => set({ direction: value as Direction }));
  onSegmented('#script-select', value => set({ script: value as ScriptSetting }));
  onSegmented('#mode-select', value => set({ mode: value as Mode }));
  onSegmented('#new-per-day', value => set({ newPerDay: Number(value) }));
  onSegmented('#goal-select', value => set({ goal: Number(value) }));
  onSegmented('#speed-select', value => set({ speedCheck: value as SpeedCheck }));
  onDelegate(groupSelect, 'button[data-group]', button =>
    data.update(state => toggleGroup(state, button.dataset.group as GroupId)),
  );
  onDelegate(rowsBody, 'button[data-row]', button => data.update(state => toggleRow(state, button.dataset.row ?? '')));
  // Kanji levels have up to 42 rows each, so their chips stay hidden until the level is opened.
  const expanded = new Set<string>();
  onDelegate(rowsBody, 'button[data-expand]', button => {
    const group = button.dataset.expand ?? '';
    if (!expanded.delete(group)) expanded.add(group);
    controls.render();
  });

  const controls: Controls = {
    render() {
      const state = data.get();
      const { settings } = state;
      press('#direction-select', settings.direction);
      press('#script-select', settings.script);
      press('#mode-select', settings.mode);
      press('#new-per-day', settings.newPerDay);
      press('#goal-select', settings.goal);
      press('#speed-select', settings.speedCheck);
      modeSelect.hidden = settings.direction === 'match' || settings.direction === 'write';
      const listen = document.querySelector<HTMLButtonElement>('#direction-select [data-value="listen"]');
      if (listen) {
        listen.title = hasJapaneseVoice()
          ? 'Hear the kana, then pick or type it'
          : 'Needs a Japanese voice for speech. None was found in this browser.';
      }
      setHtml(
        groupSelect,
        GROUPS.map(
          group =>
            html`<button data-group="${group.id}" aria-pressed="${PRESSED[groupSelection(state, group.id)]}">
              ${group.label} <span class="jp hint">${group.hint}</span>
            </button>`,
        ),
      );
      rowsSummaryLabel.textContent = rowsSummary(state);
      newSummary.textContent = `· ${settings.newPerDay} new/day`;
      setHtml(
        rowsBody,
        GROUPS.map(group => {
          const rows = ROW_INFO.filter(row => row.group === group.id);
          const chips = html`<div class="row-chips">${rows.map(row => rowChip(row, settings))}</div>`;
          if (!isKanjiGroup(group.id)) {
            return html`<div class="row-group">
              <div class="row-group-head">${group.label}</div>
              ${chips}
            </div>`;
          }
          const open = expanded.has(group.id);
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
        }),
      );
    },
  };
  return controls;
}
