import { GROUPS } from '../data.ts';
import { ROW_INFO } from '../kana.ts';
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
  const available = script === 'both' || Boolean(row.preview[script]);
  const preview =
    (script === 'both' ? undefined : row.preview[script]) ?? row.preview.hiragana ?? row.preview.katakana ?? '';
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

  return {
    render() {
      const state = data.get();
      const { settings } = state;
      press('#direction-select', settings.direction);
      press('#script-select', settings.script);
      press('#mode-select', settings.mode);
      press('#new-per-day', settings.newPerDay);
      press('#goal-select', settings.goal);
      press('#speed-select', settings.speedCheck);
      modeSelect.hidden = settings.direction === 'match';
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
        GROUPS.map(
          group =>
            html`<div class="row-group">
              <div class="row-group-head">${group.label}</div>
              <div class="row-chips">
                ${ROW_INFO.filter(row => row.group === group.id).map(row => rowChip(row, settings))}
              </div>
            </div>`,
        ),
      );
    },
  };
}
