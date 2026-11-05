import AxeBuilder from '@axe-core/playwright';
import { answer, expect, feedback, openApp, prompt, start, test } from './fixtures.ts';

test('anything can be looked up and opened, also from the keyboard', async ({ page }) => {
  await openApp(page);
  await page.locator('#search-btn').click();
  const dialog = page.locator('#search-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#search-status')).toContainText('Type a character');

  await page.locator('#search-input').fill('water');
  await expect(page.locator('.search-result[data-open="水"]')).toBeVisible();
  await page.locator('#search-input').fill('水');
  await page.locator('#search-input').press('Enter');
  await expect(page.locator('#dialog-kana')).toHaveText('水');
  await expect(page.locator('#dialog-body')).toContainText('On reading');
  await page.locator('#dialog-close').click();
  await expect(dialog).toBeVisible();

  await page.locator('#search-input').fill('zzzzqq');
  await expect(page.locator('#search-status')).toHaveText('Nothing found.');
  await page.locator('#search-close').click();
  await expect(dialog).toBeHidden();

  await page.keyboard.press('/');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#search-input')).toBeFocused();
});

test('/ doesn’t open search while typing an answer', async ({ page }) => {
  await start(page);
  await expect(prompt(page)).toHaveText('あ');
  await page.locator('#answer-input').press('/');
  await expect(page.locator('#search-dialog')).toBeHidden();
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');
});

test('drilling from a search result closes the search', async ({ page }) => {
  await openApp(page);
  await page.locator('#search-btn').click();
  await page.locator('#search-input').fill('水');
  await page.locator('.search-result[data-open="水"]').click();
  await page.getByRole('button', { name: 'Drill with its words' }).click();
  await expect(page.locator('#search-dialog')).toBeHidden();
  await expect(page.locator('#drill-text')).toHaveText('Drilling 水 and its words');
});

test('search has no accessibility violations', async ({ page }) => {
  await openApp(page);
  await page.locator('#search-btn').click();
  await page.locator('#search-input').fill('water');
  await expect(page.locator('.search-result').first()).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('#search-dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map(violation => violation.id)).toEqual([]);
});
