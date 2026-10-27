import { EXAMPLES, NOTES } from '../data.ts';
import { formatSeconds, formatWait } from '../format.ts';
import { DIRECTIONS, getKana, isWord, lookalikesOf, statKey, supportsDirection } from '../kana.ts';
import { mixUpsFor } from '../mistakes.ts';
import { levelOf } from '../schedule.ts';
import type { KanaItem, State } from '../types.ts';
import { codePoints } from '../util.ts';
import { bigJp, jp } from './dom.ts';
import { html, type Html } from './html.ts';
import { DIRECTION_LABEL, GROUP_LABEL, LEVEL_LABEL, SCRIPT_LABEL } from './labels.ts';

const join = (parts: Html[], separator: string): Html[] =>
  parts.flatMap((part, i) => (i ? [html`${separator}`, part] : [part]));

function describeWord(item: KanaItem): Html[] {
  const small = item.script === 'katakana' ? 'ッ' : 'っ';
  const parts: Html[] = [];
  if (/[っッ]/.test(item.kana)) {
    parts.push(html`The small ${jp(small)} doubles the next consonant: hold a tiny pause before it.`);
  }
  if (item.kana.includes('ー')) parts.push(html`${jp('ー')} stretches the vowel before it to twice its length.`);
  if (item.script === 'hiragana' && /[āīūēō]/.test(item.romaji)) {
    parts.push(html`In hiragana a long vowel is written with an extra vowel kana: ${jp('こう')} = kō.`);
  }
  return join(parts, ' ');
}

export function describeComposition(item: KanaItem): Html | null {
  const chars = codePoints(item.kana);
  if (item.group === 'sokuon') return html`${describeWord(item)}`;
  if (item.group === 'dakuten' || (chars.length === 1 && item.group === 'extended')) {
    const [base = '', mark] = codePoints(item.kana.normalize('NFD'));
    const markName =
      mark === '゙'
        ? html`dakuten ${jp('゛')}, which voices the consonant`
        : html`handakuten ${jp('゜')}, which turns h into p`;
    return html`${jp(base)} (${getKana(base).romaji}) + ${markName}`;
  }
  if (item.group === 'yoon' || item.group === 'extended') {
    const [first = '', small = ''] = chars;
    const purpose = item.group === 'yoon' ? 'blended into one syllable' : 'used to write sounds from other languages';
    return html`${jp(first)} (${getKana(first).romaji}) + small ${jp(small)}, ${purpose}`;
  }
  return null;
}

function recordText(item: KanaItem, state: State, now: number): Html {
  const lines = DIRECTIONS.filter(direction => supportsDirection(item, direction)).flatMap(direction => {
    const stat = state.stats[statKey(item, direction)];
    if (!stat?.box) return [];
    const level = levelOf(stat);
    return [
      html`<div>
        <span class="muted">${DIRECTION_LABEL[direction]}:</span> ${stat.correct} right · ${stat.wrong}
        wrong${stat.avgMs ? ` · avg ${formatSeconds(stat.avgMs)}` : ''} · due ${formatWait(stat.due - now)}
        <span class="pill level-${level}">${LEVEL_LABEL[level]}</span>
      </div>`,
    ];
  });
  return lines.length ? html`${lines}` : html`<span class="muted">Not practised yet</span>`;
}

const strokeOrderBlock = (item: KanaItem): Html =>
  html`<div class="stroke-order" data-kana="${item.kana}">
    <div class="stroke-stage"><span class="muted small">Loading…</span></div>
    <span class="stroke-count"></span>
    <button type="button" class="ghost small stroke-replay" hidden>Replay</button>
    <button type="button" class="ghost small writing-toggle" aria-expanded="false" hidden>Practise writing</button>
    <a class="muted small credit" href="https://kanjivg.tagaini.net" target="_blank" rel="noopener"
      >Stroke data: KanjiVG, CC BY-SA 3.0</a
    >
    <div class="writing" hidden></div>
  </div>`;

function highlightExample(word: string, kana: string): Html[] {
  return word.split(kana).flatMap((part, i) => (i ? [html`<mark>${kana}</mark>`, html`${part}`] : [html`${part}`]));
}

export function renderInfo(item: KanaItem, state: State, now = Date.now()): Html {
  const rows: Html[] = [];
  const add = (label: string, value: Html | string) =>
    rows.push(
      html`<dt>${label}</dt>
        <dd>${value}</dd>`,
    );
  const alternatives = item.accepted.slice(1);

  add(
    'Reading',
    html`<strong class="romaji">${item.romaji}</strong>${
        alternatives.length > 0 && html` <span class="muted">also accepted: ${alternatives.join(', ')}</span>`
      }`,
  );
  if (item.meaning) add('Meaning', item.meaning);
  add('Type', `${SCRIPT_LABEL[item.script]} · ${item.row} · ${GROUP_LABEL[item.group]}`);
  if (item.counterpart) add(item.script === 'hiragana' ? 'In katakana' : 'In hiragana', bigJp(item.counterpart));
  if (!isWord(item)) add('Stroke order', strokeOrderBlock(item));

  if (item.origin) {
    add(
      'Origin',
      item.script === 'hiragana'
        ? html`Simplified cursive form of the kanji ${bigJp(item.origin)}`
        : html`Taken from part of the kanji ${bigJp(item.origin)}`,
    );
  }

  const composition = describeComposition(item);
  if (composition) add(item.group === 'sokuon' ? 'How it works' : 'Built from', composition);

  const example = EXAMPLES[item.kana];
  if (example) {
    add(
      'Example',
      html`<span class="jp big">${highlightExample(example.word, item.kana)}</span>
        <span class="muted">${example.reading}</span> — ${example.meaning}`,
    );
  }

  const notes = [NOTES[item.kana], item.rowNote].filter(Boolean);
  if (notes.length) add('Note', notes.join(' '));

  const similar = lookalikesOf(item);
  if (similar.length) {
    add(
      'Don’t confuse',
      html`${join(
        similar.map(k => html`${bigJp(k.kana)} ${k.romaji}`),
        ' · ',
      )}`,
    );
  }

  const mixUps = mixUpsFor(item, state.mistakes);
  if (mixUps.length) {
    add(
      'You mixed it up with',
      html`${join(
        mixUps.map(({ other, count }) => html`${bigJp(other.kana)} ${other.romaji} ×${count}`),
        ' · ',
      )}`,
    );
  }

  add('Your record', recordText(item, state, now));
  return html`<dl class="info-list">${rows}</dl>`;
}
