import { answer, expect, feedback, openApp, start, test } from './fixtures.ts';

test('a warning appears when the browser won’t save progress, and goes once it does', async ({ page }) => {
  await page.addInitScript(() => {
    // Saving fails while the page sets window.storageFull, like a browser whose storage is full.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the right this below
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if ((window as { storageFull?: boolean }).storageFull) throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await start(page);
  await page.evaluate(() => {
    (window as { storageFull?: boolean }).storageFull = true;
  });
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
  const warning = page.getByRole('alert').filter({ hasText: 'Your progress isn’t being saved.' });
  await expect(warning).toBeVisible();
  await expect(warning.getByRole('button', { name: 'Export progress' })).toBeVisible();

  await page.evaluate(() => {
    (window as { storageFull?: boolean }).storageFull = false;
  });
  await page.keyboard.press('Enter');
  await answer(page, 'i');
  await expect(warning).toBeHidden();
});

test('words can be recalled from their meaning', async ({ page, seed }) => {
  await seed({ version: 7, settings: { rows: ['words:Nature'], direction: 'recall', mode: 'type' } });
  await openApp(page);
  await page.locator('#continue-btn').click();
  const prompt = page.locator('#kana');
  await expect(prompt).toHaveClass(/is-meaning/);
  await expect(page.locator('#card-script')).toContainText('Type the word');
  await page.locator('#skip-btn').click();
  await expect(feedback(page)).toContainText(/“.+” is .+, [a-zāīūēō]+\./);
});
