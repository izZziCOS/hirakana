import type { Page } from '@playwright/test';
import { answer, dayKey, expect, feedback, openApp, prompt, start, test } from './fixtures.ts';

const session = (page: Page) => page.locator('#session');

test('a typo can be counted as right', async ({ page }) => {
  await start(page);
  await answer(page, 'aa');
  await expect(feedback(page)).toContainText('あ is “a”.');
  await page.getByRole('button', { name: 'I made a typo' }).click();
  await expect(feedback(page)).toContainText('Correct!');
  await expect(session(page)).toContainText('Session 1/1');
  await page.getByRole('tab', { name: 'Mistakes' }).click();
  await expect(page.locator('#mistake-list .mistake')).toHaveCount(0);
});

test('the last answer can be undone', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Multiple choice' }).click();
  await page.locator('#continue-btn').click();
  await page.locator('#choices .choice:not([data-value="a"])').first().click();
  await expect(session(page)).toContainText('Session 0/1');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(prompt(page)).toHaveText('あ');
  await expect(page.locator('#choices .choice:disabled')).toHaveCount(0);
  await expect(session(page)).toContainText('Session 0/0');
  await page.locator('#choices .choice[data-value="a"]').click();
  await expect(feedback(page)).toContainText('Correct!');
});

test('the on-screen kana keyboard can answer recall cards', async ({ page, seed }) => {
  await seed({ version: 5, settings: { direction: 'recall', mode: 'type', rows: ['basic:Vowels'] } });
  await start(page);
  await page.locator('#pad-toggle').click();
  await expect(page.locator('#kana-pad')).toBeVisible();
  await expect(page.locator('#answer-input')).toHaveAttribute('inputmode', 'none');
  await page.locator('.kana-key[data-key="い"]').click();
  await page.locator('[data-pad="backspace"]').click();
  await page.locator('.kana-key[data-key="あ"]').click();
  await expect(page.locator('#answer-input')).toHaveValue('あ');
  await page.locator('#kana-pad [data-pad="submit"]').click();
  await expect(feedback(page)).toContainText('Correct! a = あ');
  await page.reload();
  await page.locator('#continue-btn').click();
  await expect(page.locator('#kana-pad')).toBeVisible();
});

test('listening explains when there is no Japanese voice', async ({ page, seed }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [],
        speak: () => undefined,
        cancel: () => undefined,
        addEventListener: () => undefined,
      },
    });
  });
  await seed({ version: 5, settings: { direction: 'listen' } });
  await start(page);
  await expect(feedback(page)).toContainText('Listening needs a Japanese voice');
});

test('listening plays the kana and asks for it', async ({ page, seed }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { spoken });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [{ lang: 'ja-JP', name: 'Test voice' }],
        speak: (utterance: { text: string }) => spoken.push(utterance.text),
        cancel: () => undefined,
        addEventListener: () => undefined,
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        voice: unknown = null;
        lang = '';
        rate = 1;
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
  });
  await seed({ version: 5, settings: { direction: 'listen', mode: 'choose', rows: ['basic:Vowels'] } });
  await start(page);
  await expect(prompt(page)).toHaveText('♪');
  await expect(page.locator('#card-script')).toHaveText('Listen, then pick the hiragana');
  await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toEqual(['あ']);
  await page.locator('#choices .choice[data-value="あ"]').click();
  await expect(feedback(page)).toContainText('Correct! That was あ (a).');
});

test('the session goal shows progress and celebrates when reached', async ({ page, seed }) => {
  await seed({ version: 5, settings: { goal: 10, rows: ['basic:Vowels', 'basic:K-row'] } });
  await start(page);
  await expect(session(page)).toContainText('Goal 0/10');
  for (const romaji of ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke']) {
    await answer(page, romaji);
    await expect(feedback(page)).toContainText('Correct!');
    // A milestone (a new number of readable words) keeps the card up until Next.
    if (await page.locator('#feedback .milestone').isVisible()) await page.keyboard.press('Enter');
    await expect(feedback(page)).not.toContainText('Correct!');
  }
  await answer(page, 'ko');
  await expect(feedback(page)).toContainText('Session goal reached: 10 cards');
  await expect(session(page)).toContainText('Goal 10/10');
});

test('the theme can be switched and is applied before the app loads', async ({ page }) => {
  await openApp(page);
  const toggle = page.locator('#theme-toggle');
  await expect(toggle).toHaveAccessibleName('Theme: same as your device');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('settings open in a dialog and the speed check can be turned off', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#speed-select [data-value="off"]').click();
  await expect(page.locator('#speed-select [data-value="off"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-dialog')).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#speed-select [data-value="off"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#settings-close').click();
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('あ');
});

test('selecting a calendar day shows that day’s mistakes', async ({ page, seed }) => {
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  await seed({
    version: 5,
    mistakes: [
      { kana: 'あ', given: 'o', at: Date.now(), direction: 'read' },
      { kana: 'さ', given: 'chi', at: yesterday, direction: 'read' },
      { kana: 'き', given: 'sa', at: yesterday - 1000, direction: 'read' },
    ],
    days: { [dayKey(-1)]: { answers: 8, learned: 2, scored: 8, correct: 6 } },
  });
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator(`.heat-cell[data-day="${dayKey(-1)}"]`).click();
  await expect(page.getByRole('tab', { name: 'Mistakes' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#day-filter')).toContainText('Mistakes on');
  await expect(page.locator('#mistake-list .mistake')).toHaveCount(2);
  await page.getByRole('button', { name: 'Show all days' }).click();
  await expect(page.locator('#mistake-list .mistake')).toHaveCount(3);
});

async function strokePaths(page: Page, file: string): Promise<{ x: number; y: number }[][]> {
  return page.evaluate(async svgFile => {
    const canvas = document.querySelector('.writing-canvas');
    if (!canvas) throw new Error('No writing canvas');
    const box = canvas.getBoundingClientRect();
    const source = await (await fetch(`kanjivg/${svgFile}`)).text();
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    const strokes = [...doc.querySelectorAll('[id^="kvg:StrokePaths"] path')].map(original => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', original.getAttribute('d') ?? '');
      svg.append(path);
      const length = path.getTotalLength();
      return Array.from({ length: 16 }, (_, i) => {
        const point = path.getPointAtLength((length * i) / 15);
        return { x: box.left + (point.x / 109) * box.width, y: box.top + (point.y / 109) * box.height };
      });
    });
    svg.remove();
    return strokes;
  }, file);
}

async function draw(page: Page, points: { x: number; y: number }[]): Promise<void> {
  await page.locator('.writing-canvas').evaluate((canvas, stroke) => {
    const fire = (type: string, point: { x: number; y: number }) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          pointerType: 'touch',
          pointerId: 7,
        }),
      );
    const [first, ...rest] = stroke;
    if (!first) return;
    fire('pointerdown', first);
    rest.forEach(point => fire('pointermove', point));
    fire('pointerup', rest.at(-1) ?? first);
  }, points);
}

test('handwriting practice checks each stroke', async ({ page, seed }) => {
  await seed({ version: 5, settings: { script: 'katakana', rows: ['basic:N-row'] } });
  await start(page);
  await expect(prompt(page)).toHaveText('ナ');
  await page.locator('#info summary').click();
  await page.getByRole('button', { name: 'Practise writing' }).click();
  await expect(page.locator('.writing-title')).toHaveText('Write ナ');
  const [first, second] = await strokePaths(page, '030ca.svg');
  if (!first || !second) throw new Error('ナ should have two strokes');

  await draw(page, [...second].reverse());
  await expect(page.locator('.writing-status')).toContainText(/Start this stroke|shape|ends somewhere else/);
  await expect(page.locator('.writing-progress')).toHaveText('Stroke 1 of 2');

  await draw(page, first);
  await expect(page.locator('.writing-progress')).toHaveText('Stroke 2 of 2');
  await draw(page, second);
  await expect(page.locator('.writing-progress')).toHaveText('Done');
  await expect(page.locator('.writing-status')).toContainText('Done, with 1 stroke(s) retried');
});
