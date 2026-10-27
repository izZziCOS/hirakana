import { answer, expect, feedback, openApp, prompt, start, test } from './fixtures.ts';

const now = Date.now();

test('mistakes are listed and mixed-up pairs can be drilled', async ({ page, seed }) => {
  await seed({
    version: 4,
    settings: { script: 'katakana' },
    mistakes: [
      { kana: 'シ', given: 'tsu', at: now - 1000, direction: 'read' },
      { kana: 'ツ', given: 'シ', at: now - 2000, direction: 'recall' },
      { kana: 'ソ', given: 'n', at: now - 3000, direction: 'read' },
    ],
  });
  await openApp(page);
  await page.getByRole('tab', { name: 'Mistakes' }).click();

  await expect(page.locator('#mistake-list .mistake')).toHaveCount(3);
  await expect(page.locator('#mistake-list')).toContainText('you said tsu');
  const pair = page.locator('.pair-card').filter({ hasText: 'shi / tsu' });
  await expect(pair).toContainText('×2');

  await pair.getByRole('button', { name: 'Drill' }).click();
  await expect(page.locator('#drill-banner')).toContainText('Drilling シ ⇄ ツ');
  await expect(prompt(page)).toHaveText(/^[シツ]$/);
  await expect(page.locator('#card-badge')).toHaveText('Drill');

  await page.getByRole('button', { name: 'Back to normal practice' }).click();
  await expect(page.locator('#drill-banner')).toBeHidden();
});

test('a new mistake shows up in the history', async ({ page }) => {
  await start(page);
  await answer(page, 'ka');
  await expect(feedback(page)).toContainText('which is か');
  await page.getByRole('tab', { name: 'Mistakes' }).click();
  await expect(page.locator('#mistake-list .mistake').first()).toContainText('Answer a · you said ka');
});

test('an error banner appears if the app fails to load', async ({ page }) => {
  await page.clock.install();
  await page.route(/main-[A-Z0-9]+\.js$/, route => route.abort());
  await openApp(page);
  await page.clock.fastForward(9000);
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
});
