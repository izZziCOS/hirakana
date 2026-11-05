import AxeBuilder from '@axe-core/playwright';
import { expect, openApp, test } from './fixtures.ts';

test('a passage is read with readings on demand, its questions answered and its result kept', async ({
  page,
  seed,
}) => {
  await seed({ version: 9 });
  await openApp(page);
  await page.getByRole('tab', { name: 'Read' }).click();
  await page.locator('#reader-mode').getByRole('button', { name: 'Passages' }).click();
  await expect(page.locator('#sentence-list')).toBeHidden();
  await expect(page.locator('#reader-show-control')).toBeHidden();
  const view = page.locator('#passage-view');
  await expect(view.locator('.passage-level')).toHaveCount(5);

  await view.locator('[data-passage="my-day"]').click();
  await expect(view.locator('.passage-title')).toContainText('一日');
  const word = view.locator('.passage-text .sentence-word').first();
  const before = await word.getAttribute('aria-pressed');
  await word.click();
  expect(await word.getAttribute('aria-pressed')).not.toBe(before);
  await view.locator('.passage-text summary').first().click();
  await expect(view.locator('.passage-text')).toContainText('I get up at seven every morning.');

  await view.getByRole('button', { name: 'By train' }).click();
  await expect(view.getByRole('button', { name: 'By train' })).toHaveClass(/correct/);
  await expect(view.getByRole('button', { name: 'By bus' })).toBeDisabled();
  await view.getByRole('button', { name: 'English' }).click();
  await expect(view.getByRole('button', { name: 'English' })).toHaveClass(/wrong/);
  await expect(view.getByRole('button', { name: 'Japanese' })).toHaveClass(/correct/);
  await expect(view.locator('.passage-result')).toBeEmpty();
  await view.getByRole('button', { name: 'The library' }).click();
  await expect(view.locator('.passage-result')).toContainText('2 of 3 right.');

  await view.getByRole('button', { name: 'Try the questions again' }).click();
  await expect(view.getByRole('button', { name: 'By bus' })).toBeEnabled();
  await view.locator('[data-passage-back]').click();
  await expect(view.locator('[data-passage="my-day"]')).toContainText('last time 2/3');

  await page.locator('#reader-mode').getByRole('button', { name: 'Sentences' }).click();
  await expect(page.locator('#reader-summary')).toBeVisible();
  await expect(page.locator('#reader-show-control')).toBeVisible();
  await expect(view).toBeHidden();
});

test('passages have no accessibility violations', async ({ page, seed }) => {
  await seed({ version: 9 });
  await openApp(page);
  await page.getByRole('tab', { name: 'Read' }).click();
  await page.locator('#reader-mode').getByRole('button', { name: 'Passages' }).click();
  await page.locator('[data-passage="kyoto-trip"]').click();
  await page.locator('.passage-option').first().click();
  const results = await new AxeBuilder({ page })
    .include('#view-read')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map(violation => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`)).toEqual([]);
});
