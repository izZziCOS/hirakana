import { expect, openApp, savedProgress, test } from './fixtures.ts';

const past = Date.now() - 3_600_000;

test('the Progress tab shows how much of each JLPT level is known', async ({ page, seed }) => {
  await seed({
    version: 9,
    stats: { 水: { correct: 9, wrong: 0, streak: 9, box: 6, due: past, last: past } },
  });
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  const readiness = page.locator('.readiness');
  await expect(readiness).toContainText('Next goal: N5');
  await expect(readiness.locator('.readiness-level')).toHaveCount(5);
  await expect(readiness.locator('.readiness-level').first()).toContainText('1/80');
});

test('a mock test can be taken, is scored and saved, and doesn’t change reviews', async ({ page, seed }) => {
  await seed({ version: 9, settings: { rows: ['basic:Vowels'] } });
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('[data-mock="5"]').click();
  const dialog = page.locator('#mock-dialog');
  await expect(dialog).toContainText('30 questions');
  await dialog.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#mock-clock')).toHaveText(/^1[45]:\d\d$/);
  for (let i = 0; i < 29; i++) {
    await expect(dialog.locator('.mock-progress')).toContainText(`Question ${i + 1} of 30`);
    await dialog.locator('.choice').first().click();
  }
  await expect(dialog.locator('.mock-progress')).toContainText('Question 30 of 30');
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog.locator('.mock-score')).toContainText('/30');
  await expect(page.locator('#mock-clock')).toBeHidden();
  await expect(dialog.locator('.mock-sections')).toContainText('Kanji:');

  await page.waitForTimeout(600);
  const saved = (await savedProgress(page)) as unknown as {
    mockTests: { level: number; total: number }[];
    stats: object;
  };
  expect(saved.mockTests[0]?.level).toBe(5);
  expect(saved.mockTests[0]?.total).toBe(30);
  expect(saved.stats).toEqual({});

  await page.locator('#mock-close').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.readiness-level').first()).toContainText('Last mock test:');
});

test('leaving a mock test asks first and saves nothing', async ({ page, seed }) => {
  await seed({ version: 9 });
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('[data-mock="4"]').click();
  const dialog = page.locator('#mock-dialog');
  await dialog.getByRole('button', { name: 'Start' }).click();
  await page.locator('#mock-close').click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.locator('.mock-progress')).toBeVisible();
  await page.locator('#mock-close').click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Leave' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.readiness-level').nth(1)).not.toContainText('Last mock test:');
});

test('missed questions can be practised from the results', async ({ page, seed }) => {
  await seed({ version: 9 });
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('[data-mock="5"]').click();
  const dialog = page.locator('#mock-dialog');
  await dialog.getByRole('button', { name: 'Start' }).click();
  for (let i = 0; i < 30; i++) await dialog.getByRole('button', { name: 'Skip' }).click();
  await dialog.getByRole('button', { name: 'Practise grammar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#drill-text')).toHaveText('Drilling what you missed in the N5 mock test');
  await expect(page.locator('#card-script')).toContainText('the missing part');
});
