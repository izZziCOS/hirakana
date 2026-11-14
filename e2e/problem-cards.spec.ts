import { answer, expect, feedback, openApp, prompt, savedProgress, test } from './fixtures.ts';

const past = Date.now() - 3_600_000;
const missed = { correct: 2, wrong: 9, streak: 0, box: 1, due: past, last: past };
const vowels = { rows: ['basic:Vowels'], direction: 'read', mode: 'type' };

test('a card you keep missing is pointed out, and can be suspended and resumed', async ({ page, seed }) => {
  await seed({ version: 9, settings: vowels, stats: { あ: missed } });
  await openApp(page);
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('あ');
  await answer(page, 'zz');
  await expect(feedback(page)).toContainText('You keep missing this one.');
  await feedback(page).getByRole('button', { name: 'Suspend' }).click();
  await expect(prompt(page)).toHaveText('い');

  await page.getByRole('tab', { name: 'Mistakes' }).click();
  await expect(page.locator('#problem-section')).toBeHidden();
  const suspended = page.locator('#suspended-cards [data-open="あ"]');
  await expect(suspended).toBeVisible();
  await suspended.click();
  await expect(page.locator('#dialog-body')).toContainText('Suspended: left out of practice');
  await page.locator('#dialog-body').getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#dialog-body')).not.toContainText('Suspended: left out of practice');
  await expect(page.locator('#suspended-section')).toBeHidden();
  await expect(page.locator('#problem-cards [data-open="あ"]')).toBeVisible();
});

test('cards you keep missing can be practised together from the Mistakes tab', async ({ page, seed }) => {
  await seed({ version: 9, settings: vowels, stats: { あ: missed, い: missed } });
  await openApp(page);
  await page.getByRole('tab', { name: 'Mistakes' }).click();
  await page.locator('#problem-drill').click();
  await expect(page.locator('#drill-text')).toHaveText('Drilling the cards you keep missing');
  await expect(prompt(page)).toHaveText(/[あい]/);
});

test('“I know this” on the card in front of you moves on, without counting as a mistake', async ({ page, seed }) => {
  await seed({ version: 9, settings: vowels });
  await openApp(page);
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('あ');
  await page.locator('#info summary').click();
  await page.locator('#info-body').getByRole('button', { name: 'I know this' }).click();
  await expect(prompt(page)).toHaveText('い');
  await expect
    .poll(async () => ((await savedProgress(page)).stats as Record<string, { box: number }> | undefined)?.['あ']?.box)
    .toBe(7);
});

test('a suspended card stays out of practice after a reload', async ({ page, seed }) => {
  await seed({
    version: 9,
    settings: { ...vowels, rows: ['basic:Vowels'] },
    suspensions: { あ: { on: true, at: Date.now() } },
  });
  await openApp(page);
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('い');
});
