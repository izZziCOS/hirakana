import { readFile } from 'node:fs/promises';
import {
  answer,
  confirmDialog,
  dayKey,
  expect,
  feedback,
  openApp,
  prompt,
  savedStatKeys,
  start,
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
  await start(page);
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await expect.poll(() => savedStatKeys(page)).toEqual(['あ']);

  await page.reload();
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.locator('.stat-card').first()).toContainText('1');
});

test('the old storage key is migrated to the new one', async ({ page, seed }) => {
  await seed({ version: 3, settings: { script: 'katakana', rows: ['basic:Vowels'] }, bestStreak: 7 }, 'kana-dojo-v1');
  await start(page);
  await expect(prompt(page)).toHaveText('ア');
  await answer(page, 'a');
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('kana-dojo'))))
    .toEqual([STORAGE_KEY]);
});

test('activity and accuracy charts have tooltips and table views', async ({ page, seed }) => {
  await seed({ version: 4, days: withHistory() });
  await openApp(page);
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
  await start(page);
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
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('#import-file').setInputFiles({
    name: 'nope.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": 1}'),
  });
  await expect(page.locator('#transfer-status')).toHaveText('That file isn’t a Kana Dojo progress export.');
});

test('the info dialog opens from the progress grid', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('#progress-grids .cell[data-open="か"]').click();
  await expect(page.locator('#kana-dialog')).toBeVisible();
  await expect(page.locator('#dialog-kana')).toHaveText('か');
  await expect(page.locator('#dialog-body .stroke-count')).toHaveText('3 strokes');
});

test('the home screen asks for a backup after a week of practice and exporting clears it', async ({ page, seed }) => {
  await seed({ version: 5, days: { [dayKey(-8)]: { answers: 3, learned: 3, scored: 3, correct: 3 } } });
  await openApp(page);
  const note = page.locator('#backup-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Not backed up yet.');

  const downloadPromise = page.waitForEvent('download');
  await note.getByRole('button', { name: 'Export progress' }).click();
  await downloadPromise;
  await expect(note).toBeHidden();
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.locator('#backup-status')).toHaveText('Last backed up today.');
});

test('"Not now" hides the backup reminder until the next visit', async ({ page, seed }) => {
  await seed({ version: 5, days: { [dayKey(-8)]: { answers: 3, learned: 3, scored: 3, correct: 3 } } });
  await openApp(page);
  await page.locator('#backup-later').click();
  await expect(page.locator('#backup-note')).toBeHidden();
  await page.reload();
  await expect(page.locator('#backup-note')).toBeVisible();
});

test('answers given in another tab are kept when this tab answers next', async ({ page, context }) => {
  const correctCount = () =>
    page.evaluate(
      key =>
        (JSON.parse(localStorage.getItem(key) ?? '{}') as { stats?: Record<string, { correct: number }> }).stats?.あ
          ?.correct,
      STORAGE_KEY,
    );
  await start(page);
  await expect(prompt(page)).toHaveText('あ');
  const other = await context.newPage();
  await start(other);
  await answer(other, 'a');
  await expect(feedback(other)).toContainText('Correct!');
  await expect.poll(correctCount).toBe(1);

  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await expect.poll(correctCount).toBe(2);
});

test('kanji progress is kept when the kanji load after the app', async ({ page, seed }) => {
  const stat = { correct: 2, wrong: 0, streak: 2, box: 3, due: Date.now() + 3_600_000, last: Date.now() };
  await seed({ version: 6, stats: { 日: stat, 'meaning:水': stat, あ: stat }, settings: { rows: ['k5:N5 · 1–30'] } });
  await openApp(page);
  await expect(page.locator('#hero-detail')).toContainText('N5');
  // Any change saves the whole state; the kanji cards must still be in it.
  await page.locator('#theme-toggle').click();
  await expect.poll(() => savedStatKeys(page)).toEqual(['日', 'meaning:水', 'あ']);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('kana-dojo')?.includes('"theme":"light"')))
    .toBe(true);
});

test('a kana learner sees the kanji sets once they have loaded in the background', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.track-group[data-group="k5"] .track-group-status')).toHaveText('80 cards');
});

test('an import can be merged with the progress already here', async ({ page }) => {
  await start(page);
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await page.getByRole('tab', { name: 'Progress' }).click();
  const stat = { correct: 1, wrong: 0, streak: 1, box: 2, due: Date.now() + 600_000, last: Date.now() - 1000 };
  await page.locator('#import-file').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ app: 'kana-dojo', device: 'phone', data: { version: 6, stats: { か: stat } } }),
    ),
  });
  await confirmDialog(page, 'Merge');
  await expect(page.locator('#transfer-status')).toHaveText('Progress merged.');
  await expect.poll(async () => (await savedStatKeys(page)).sort()).toEqual(['あ', 'か']);
});
