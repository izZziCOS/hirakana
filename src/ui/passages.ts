import { parseSentence, plainText, readingOf } from '../furigana.ts';
import type { Passage } from '../passages-data.ts';
import { knowsKanji, type Sentence } from '../sentences.ts';
import { recordPassage } from '../state.ts';
import type { AppStores } from '../store.ts';
import { codePoints, unique } from '../util.ts';
import { onDelegate } from './dom.ts';
import { html, setHtml, type Html } from './html.ts';
import type { KanaDialog } from './dialog.ts';
import { bindWordPicks, type Furigana, newPicks, segmentMarkup, sentenceItem } from './sentences.ts';
import { canSpeak, speak } from './speech.ts';

const HAN = /\p{Script=Han}/u;

const toSentence = ([markup, english]: [string, string]): Sentence => {
  const segments = parseSentence(markup);
  const text = plainText(segments);
  return { segments, english, text, kanji: unique(codePoints(text).filter(char => HAN.test(char))) };
};

export interface PassagesView {
  render(): void;
}

export function createPassages(
  { data }: AppStores,
  container: HTMLElement,
  furigana: () => Furigana,
  isActive: () => boolean,
  dialog: KanaDialog,
): PassagesView {
  let passages: Passage[] | null = null;
  let loadFailed = false;
  let open: Passage | null = null;
  // The option picked for each question of the open passage.
  let picked = new Map<number, number>();
  // Words tapped in the open passage.
  let picks = newPicks();

  function listItem(passage: Passage): Html {
    const { stats, passages: results } = data.get();
    const kanji = unique(passage.paragraphs.map(toSentence).flatMap(sentence => sentence.kanji));
    const known = kanji.filter(char => knowsKanji(stats, char)).length;
    const result = results[passage.id];
    return html`<li>
      <button type="button" class="passage-link" data-passage="${passage.id}">
        <span class="passage-link-title jp" lang="ja">${plainText(parseSentence(passage.title))}</span>
        <span class="muted small">${passage.english}</span>
        <span class="muted small">
          ${kanji.length ? `${known} of ${kanji.length} kanji known` : 'In kana'}${
            result ? ` · last time ${result.correct}/${result.total}` : ''
          }
        </span>
      </button>
    </li>`;
  }

  function renderList(list: Passage[]): void {
    const levels = [5, 4, 3, 2, 1].filter(level => list.some(passage => passage.level === level));
    setHtml(
      container,
      levels.map(
        level =>
          html`<section class="passage-level" aria-label="N${level} passages">
            <h3>N${level}</h3>
            <ul class="passage-list">
              ${list.filter(passage => passage.level === level).map(listItem)}
            </ul>
          </section>`,
      ),
    );
  }

  function questionMarkup(passage: Passage, index: number): Html {
    const question = passage.questions[index];
    if (!question) return html``;
    const choice = picked.get(index);
    return html`<fieldset class="passage-question">
      <legend>${index + 1}. ${question.question}</legend>
      <div class="passage-options">
        ${question.options.map((option, i) => {
          const state = choice === undefined ? '' : i === question.answer ? ' correct' : i === choice ? ' wrong' : '';
          return html`<button
            type="button"
            class="choice passage-option${state}"
            data-question="${index}"
            data-option="${i}"
            ${choice !== undefined && html`disabled`}
          >
            ${option}
          </button>`;
        })}
      </div>
    </fieldset>`;
  }

  const correctCount = (passage: Passage): number =>
    passage.questions.filter((question, i) => picked.get(i) === question.answer).length;

  function renderPassage(passage: Passage): void {
    const state = data.get();
    const { stats } = state;
    const sentences = passage.paragraphs.map(toSentence);
    const done = picked.size === passage.questions.length;
    const titleSegments = parseSentence(passage.title);
    setHtml(
      container,
      html`<button type="button" class="link-btn passage-back" data-passage-back>← All passages</button>
        <h3 class="passage-title jp" lang="ja">
          ${titleSegments.map(segment => segmentMarkup(segment, stats, furigana()))}
        </h3>
        <p class="muted small">N${passage.level} · ${passage.english}</p>
        <ol class="sentence-list passage-text">
          ${sentences.map((sentence, i) =>
            sentenceItem(sentence, i, { stats, furigana: furigana(), listen: canSpeak, picks, state }),
          )}
        </ol>
        <h3>Questions</h3>
        ${passage.questions.map((_, i) => questionMarkup(passage, i))}
        <p class="passage-result" aria-live="polite">
          ${
            done &&
            html`<strong>${correctCount(passage)} of ${passage.questions.length} right.</strong>
              <button type="button" class="ghost small" data-passage-again>Try the questions again</button>`
          }
        </p>`,
    );
  }

  function render(): void {
    if (!isActive()) return;
    if (loadFailed) {
      setHtml(
        container,
        html`<p class="muted">The passages couldn’t be loaded. Check your connection and try again.</p>`,
      );
      return;
    }
    if (!passages) {
      setHtml(container, html`<p class="muted">Loading…</p>`);
      import('../passages-data.ts').then(
        module => {
          passages = module.PASSAGES;
          render();
        },
        () => {
          loadFailed = true;
          render();
        },
      );
      return;
    }
    if (open) renderPassage(open);
    else renderList(passages);
  }

  onDelegate(container, '[data-passage]', element => {
    open = passages?.find(passage => passage.id === element.dataset.passage) ?? null;
    picked = new Map();
    picks = newPicks();
    render();
    window.scrollTo(0, 0);
  });
  onDelegate(container, '[data-passage-back]', () => {
    open = null;
    render();
  });
  onDelegate(container, '[data-passage-again]', () => {
    picked = new Map();
    render();
  });
  onDelegate(container, '.passage-option', element => {
    const passage = open;
    if (!passage) return;
    picked.set(Number(element.dataset.question), Number(element.dataset.option));
    if (picked.size === passage.questions.length) {
      const correct = correctCount(passage);
      const total = passage.questions.length;
      // Saving draws this view again.
      data.update(state => recordPassage(state, passage.id, correct, total));
    }
    render();
  });
  bindWordPicks(
    container,
    () => picks,
    data,
    render,
    id => dialog.open(id),
  );
  onDelegate(container, '[data-speak]', button => {
    const paragraph = open?.paragraphs[Number(button.dataset.speak)];
    if (paragraph) speak(readingOf(parseSentence(paragraph[0])));
  });

  return { render };
}
