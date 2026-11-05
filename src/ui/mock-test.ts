import { loadKanji } from '../kanji-loader.ts';
import {
  buildMockTest,
  formatClock,
  MOCK_SECONDS,
  MOCK_SECTION_SIZE,
  MOCK_SECTIONS,
  type MockQuestion,
  type MockScore,
  scoreMock,
} from '../mock-test.ts';
import type { JlptLevel } from '../readiness.ts';
import { recordMockTest } from '../state.ts';
import type { AppStores } from '../store.ts';
import type { KanaItem } from '../types.ts';
import { confirmAction } from './confirm.ts';
import type { KanaDialog, StartDrill } from './dialog.ts';
import { $, jp, onDelegate } from './dom.ts';
import { clozePromptMarkup, shortLabel } from './grammar.ts';
import { html, setHtml, type Html } from './html.ts';
import { choiceButtons } from './practice/card.ts';

export interface MockTestView {
  open(level: JlptLevel): void;
  close(): void;
}

const SECTION_LABEL = {
  kanji: 'Kanji: pick the reading',
  words: 'Words: pick the meaning',
  grammar: 'Grammar: fill the gap',
};

export function createMockTest(
  { data }: AppStores,
  dialog: KanaDialog,
  drill: StartDrill,
  onResult: () => void,
): MockTestView {
  const panel = $('#mock-dialog', HTMLDialogElement);
  const title = $('#mock-title');
  const clock = $('#mock-clock');
  const body = $('#mock-body');
  let level: JlptLevel = 5;
  let questions: MockQuestion[] = [];
  let answers: (string | null)[] = [];
  let timer: number | undefined;
  let endsAt = 0;
  let running = false;
  let score: MockScore | null = null;

  function stopClock(): void {
    window.clearInterval(timer);
    running = false;
    clock.hidden = true;
  }

  function renderIntro(): void {
    title.textContent = `N${level} mock test`;
    setHtml(
      body,
      html`<p>
          ${MOCK_SECTIONS.length * MOCK_SECTION_SIZE} questions from all of N${level}, whether you’ve learned them or
          not, in ${MOCK_SECONDS / 60} minutes.
        </p>
        <p class="muted small">
          It covers kanji, words and grammar. It doesn’t change your reviews, and it’s a practice check rather than a
          real JLPT score.
        </p>
        <button type="button" class="primary" data-mock-start>Start</button>`,
    );
  }

  function promptOf({ item, direction }: MockQuestion): Html {
    if (direction === 'cloze') return clozePromptMarkup(item, data.get().stats);
    return html`${item.kanji ?? item.kana}`;
  }

  function renderQuestion(): void {
    const index = answers.length;
    const question = questions[index];
    if (!question) {
      finish();
      return;
    }
    setHtml(
      body,
      html`<p class="muted small mock-progress">
          Question ${index + 1} of ${questions.length} · ${SECTION_LABEL[question.section]}
        </p>
        <div class="kana jp mock-prompt${question.direction === 'cloze' ? ' is-sentence' : ''}" lang="ja">
          ${promptOf(question)}
        </div>
        <div class="choices${question.direction === 'cloze' ? ' mock-kana-choices' : ''}">
          ${choiceButtons(question.choices, question.direction === 'cloze')}
        </div>
        <button type="button" class="ghost small mock-skip" data-mock-skip>Skip</button>`,
    );
  }

  function answer(value: string | null): void {
    if (!running) return;
    answers.push(value);
    renderQuestion();
  }

  function tick(): void {
    const left = (endsAt - Date.now()) / 1000;
    clock.textContent = formatClock(left);
    if (left <= 0) finish();
  }

  function start(): void {
    questions = buildMockTest(level);
    answers = [];
    score = null;
    running = true;
    endsAt = Date.now() + MOCK_SECONDS * 1000;
    clock.hidden = false;
    timer = window.setInterval(tick, 1000);
    tick();
    renderQuestion();
  }

  const chip = (item: KanaItem): Html =>
    html`<button type="button" class="missed-chip" data-open="${item.id}">
      ${jp(shortLabel(item))}<span class="missed-romaji">${item.romaji}</span>
    </button>`;

  function renderResult(result: MockScore): void {
    const unanswered = questions.length - answers.length;
    const others = result.missed.filter(question => question.direction !== 'cloze');
    const grammar = result.missed.filter(question => question.direction === 'cloze');
    setHtml(
      body,
      html`<p class="mock-score">${result.correct}<small>/${result.total}</small></p>
        ${unanswered > 0 && html`<p class="muted small">Time ran out with ${unanswered} questions left.</p>`}
        <ul class="mock-sections">
          ${MOCK_SECTIONS.map(section => {
            const { correct, total } = result.sections[section];
            return html`<li>${SECTION_LABEL[section].split(':')[0]}: ${correct}/${total}</li>`;
          })}
        </ul>
        ${
          result.missed.length > 0 &&
          html`<h3>Missed</h3>
            <div class="missed-chips">${result.missed.map(question => chip(question.item))}</div>
            <div class="mock-actions">
              ${
                others.length > 0 &&
                html`<button type="button" class="primary small" data-mock-drill="words">
                  Practise kanji and words
                </button>`
              }
              ${
                grammar.length > 0 &&
                html`<button type="button" class="primary small" data-mock-drill="grammar">Practise grammar</button>`
              }
            </div>`
        }`,
    );
  }

  function finish(): void {
    if (!running) return;
    stopClock();
    score = scoreMock(questions, answers);
    const { correct, total } = score;
    data.update(state => recordMockTest(state, { level, correct, total, at: Date.now() }));
    onResult();
    renderResult(score);
  }

  async function leave(): Promise<void> {
    if (running) {
      const confirmed = await confirmAction({
        title: 'Leave the mock test?',
        message: 'This attempt won’t be saved.',
        confirmLabel: 'Leave',
        danger: true,
      });
      if (!confirmed) return;
    }
    stopClock();
    panel.close();
  }

  $('#mock-close').addEventListener('click', () => void leave());
  panel.addEventListener('cancel', event => {
    event.preventDefault();
    void leave();
  });
  panel.addEventListener('close', stopClock);

  onDelegate(body, '[data-mock-start]', start);
  onDelegate(body, '[data-mock-skip]', () => answer(null));
  onDelegate(body, '.choice', element => answer(element.dataset.value ?? null));
  onDelegate(body, '[data-open]', element => dialog.open(element.dataset.open ?? ''));
  onDelegate(body, '[data-mock-drill]', element => {
    const grammar = element.dataset.mockDrill === 'grammar';
    const items = (score?.missed ?? [])
      .filter(question => (question.direction === 'cloze') === grammar)
      .map(question => question.item);
    drill(`what you missed in the N${level} mock test`, items);
  });

  panel.addEventListener('keydown', event => {
    if (!running || !/^[1-4]$/.test(event.key)) return;
    const choice = questions[answers.length]?.choices[Number(event.key) - 1];
    if (choice !== undefined) answer(choice);
  });

  return {
    open(next) {
      level = next;
      stopClock();
      renderIntro();
      panel.showModal();
      body.scrollTop = 0;
      // The start button waits for the level's cards, which load in the background.
      const button = body.querySelector<HTMLButtonElement>('[data-mock-start]');
      if (button) button.disabled = true;
      loadKanji().then(
        () => {
          if (button) button.disabled = false;
        },
        () => {
          setHtml(body, html`<p>The kanji and word lists couldn’t be loaded. Check your connection and try again.</p>`);
        },
      );
    },
    close() {
      stopClock();
      if (panel.open) panel.close();
    },
  };
}
