import { CHARACTER_ROWS } from '../../data.ts';
import type { Script } from '../../types.ts';
import { html, type Html } from '../html.ts';

const SMALL_KANA: Record<Script, string[]> = {
  hiragana: ['ゃ', 'ゅ', 'ょ', 'っ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ー'],
  katakana: ['ャ', 'ュ', 'ョ', 'ッ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ー', 'ヴ'],
};

const PAD_GROUPS = new Set(['basic', 'dakuten']);

export function kanaPadRows(script: Script): string[][] {
  const rows = CHARACTER_ROWS.filter(row => PAD_GROUPS.has(row.group)).map(row => row[script] ?? []);
  return [...rows.filter(row => row.length), SMALL_KANA[script]];
}

export const kanaPad = (script: Script): Html =>
  html`<div class="kana-pad-keys" role="group" aria-label="${script} keyboard">
      ${kanaPadRows(script).map(
        row =>
          html`<div class="kana-pad-row">
            ${row.map(kana => html`<button type="button" class="kana-key jp" data-key="${kana}">${kana}</button>`)}
          </div>`,
      )}
    </div>
    <div class="kana-pad-actions">
      <button type="button" class="ghost small" data-pad="backspace" aria-label="Delete last character">
        ⌫ Delete
      </button>
      <button type="button" class="primary small" data-pad="submit">Check</button>
    </div>`;
