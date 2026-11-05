import { answer, expect, feedback, openApp, prompt, start, STORAGE_KEY, test } from './fixtures.ts';

test('progress from a newer version stops the app rather than being overwritten', async ({ page }) => {
  const newer = { version: 999, bestStreak: 5, futureField: 'kept' };
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify(newer)] as const,
  );
  await page.goto('/');
  await expect(page.locator('#app-error')).toBeVisible();
  await expect(page.locator('#app-error-detail')).toContainText('newer version');
  const saved = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(saved ?? '{}')).toEqual(newer);
});

test('a tab stops saving once a newer version has saved, and offers to reload', async ({ page }) => {
  await start(page);
  await expect(prompt(page)).toHaveText('あ');
  const newer = JSON.stringify({ version: 999, futureField: 'kept' });
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
      window.dispatchEvent(new StorageEvent('storage', { key }));
    },
    [STORAGE_KEY, newer] as const,
  );
  const note = page.locator('#update-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('stopped saving');
  await expect(note.getByRole('button', { name: 'Reload' })).toBeVisible();

  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(600);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(newer);
});

test('progress that can’t be read is kept for the learner to download or delete', async ({ page }) => {
  const broken = '{"version":9,"stats":{"あ"';
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', 'true');
    },
    [STORAGE_KEY, broken] as const,
  );
  await page.goto('/');
  const note = page.locator('#unreadable-note');
  await expect(note).toBeVisible();
  await page.locator('#continue-btn').click();
  await expect(page.locator('#learn-btn')).toBeVisible();

  const download = page.waitForEvent('download');
  await note.getByRole('button', { name: 'Download the copy' }).click();
  expect((await download).suggestedFilename()).toBe('kana-dojo-unreadable-progress.txt');

  await page.reload();
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Delete it' }).click();
  await expect(note).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('kana-dojo-unreadable'))).toBeNull();
});

test('the writing pad says when a character’s strokes can’t be loaded, and can be passed over', async ({
  page,
  seed,
}) => {
  await page.route('**/kanjivg/**', route => route.abort());
  await seed({ version: 9, settings: { rows: ['basic:Vowels'], direction: 'write' } });
  await openApp(page);
  await page.locator('#continue-btn').click();
  const status = page.locator('#write-pad .writing-status');
  await expect(status).toContainText('couldn’t be loaded');
  await expect(page.locator('#app-error')).toBeHidden();
  await expect(page.locator('#skip-btn')).toBeHidden();
  await expect(page.locator('#write-pad [data-writing="clear"]')).toBeHidden();
  const first = await prompt(page).textContent();

  await page.unroute('**/kanjivg/**');
  await page.locator('#write-pad').getByRole('button', { name: 'Try again' }).click();
  await expect(status).toHaveText('Draw the first stroke.');
  await expect(page.locator('#skip-btn')).toBeVisible();
  await expect(page.locator('#next-btn')).toBeHidden();

  // Passing over a card that can't be shown doesn't count against it.
  await page.route('**/kanjivg/**', route => route.abort());
  await page.reload();
  await page.locator('#continue-btn').click();
  await expect(status).toContainText('couldn’t be loaded');
  await page.locator('#next-btn').click();
  await expect(prompt(page)).not.toHaveText(first ?? '');
  const mistakes = await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as { mistakes?: unknown[] };
    return saved.mistakes?.length ?? 0;
  }, STORAGE_KEY);
  expect(mistakes).toBe(0);
});
