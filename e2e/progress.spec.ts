import { readFile } from 'node:fs/promises';
import {
  answer,
  confirmDialog,
  dayKey,
  expect,
  feedback,
  prompt,
  savedStatKeys,
  STORAGE_KEY,
  test,
} from './fixtures.ts';

const withHistory = () => {
  const days: Record<string, { answers: number; learned: number; scored: number; correct: number }> = {};
  for (let offset = 1; offset <= 30; offset += 2) {
    days[dayKey(-offset)] = { answers: offset * 2, learned: 1, scored: offset * 2, correct: offset };
  }
  return days;
};

test('progress is saved and survives a reload', async ({ page }) => {
  await page.goto('/');
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await expect.poll(() => savedStatKeys(page)).toEqual(['あ']);

  await page.reload();
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.locator('.stat-card').first()).toContainText('1');
});

test('the old storage key is migrated to the new one', async ({ page, seed }) => {
  await seed({ version: 3, settings: { script: 'katakana', rows: ['basic:Vowels'] }, bestStreak: 7 }, 'kana-dojo-v1');
  await page.goto('/');
  await expect(prompt(page)).toHaveText('ア');
  await answer(page, 'a');
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('kana-dojo'))))
    .toEqual([STORAGE_KEY]);
});

test('activity and accuracy charts have tooltips and table views', async ({ page, seed }) => {
  await seed({ version: 4, days: withHistory() });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Progress' }).click();

  const cell = page.locator(`.heat-cell[data-day="${dayKey(-1)}"]`);
  await cell.focus();
  await expect(page.locator('#activity .chart-tooltip')).toContainText('2 answers');

  const trend = page.locator('#trend .chart-overlay');
  await trend.focus();
  await expect(page.locator('#trend .chart-tooltip')).toContainText('Week of');
  await trend.press('ArrowLeft');
  await expect(page.locator('#trend .chart-tooltip')).toContainText('Week of');

  await page.locator('#activity .chart-table summary').click();
  await expect(page.locator('#activity table tbody tr')).toHaveCount(14);
});

test('progress can be exported, reset and imported again', async ({ page }) => {
  await page.goto('/');
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await page.getByRole('tab', { name: 'Progress' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export progress' }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const exported = JSON.parse(await readFile(file, 'utf8')) as { app: string; data: { stats: object } };
  expect(exported.app).toBe('kana-dojo');
  expect(Object.keys(exported.data.stats)).toEqual(['あ']);

  await page.getByRole('button', { name: 'Reset all progress' }).click();
  await confirmDialog(page, 'Reset everything');
  await expect(page.locator('.stat-card').first()).toContainText('0');

  await page.locator('#import-file').setInputFiles(file);
  await confirmDialog(page, 'Replace');
  await expect(page.locator('#transfer-status')).toHaveText('Progress imported.');
  await expect(page.locator('.stat-card').first()).toContainText('1');
});

test('an invalid import file is rejected with a message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('#import-file').setInputFiles({
    name: 'nope.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": 1}'),
  });
  await expect(page.locator('#transfer-status')).toHaveText('That file isn’t a Kana Dojo progress export.');
});

test('the info dialog opens from the progress grid', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('#progress-grids .cell[data-kana="か"]').click();
  await expect(page.locator('#kana-dialog')).toBeVisible();
  await expect(page.locator('#dialog-kana')).toHaveText('か');
  await expect(page.locator('#dialog-body .stroke-count')).toHaveText('3 strokes');
});
