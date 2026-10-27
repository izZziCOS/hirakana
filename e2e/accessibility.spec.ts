import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { dayKey, expect, test } from './fixtures.ts';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
  );
}

const history = {
  version: 5,
  stats: { あ: { correct: 3, wrong: 1, streak: 1, box: 3, due: Date.now() + 3_600_000, last: Date.now() } },
  mistakes: [
    { kana: 'シ', given: 'tsu', at: Date.now() - 1000, direction: 'read' },
    { kana: 'ツ', given: 'シ', at: Date.now() - 2000, direction: 'recall' },
  ],
  days: { [dayKey(-1)]: { answers: 12, learned: 3, scored: 12, correct: 9 } },
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('practice, with the info panel and settings open, has no accessibility violations', async ({ page }) => {
      await page.goto('/');
      await page.locator('.rows-picker summary').click();
      await page.locator('#info summary').click();
      await expect(page.locator('.stroke-count')).toHaveText('3 strokes');
      expect(await violations(page)).toEqual([]);
    });

    test('a wrong answer and multiple choice have no accessibility violations', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Multiple choice' }).click();
      await page.locator('#choices .choice:not([data-value="a"])').first().click();
      await expect(page.locator('#undo-btn')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('progress and mistakes have no accessibility violations', async ({ page, seed }) => {
      await seed(history);
      await page.goto('/');
      await page.getByRole('tab', { name: 'Progress' }).click();
      await expect(page.locator('.heat-cell').first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('tab', { name: 'Mistakes' }).click();
      await expect(page.locator('.pair-card')).toHaveCount(1);
      expect(await violations(page)).toEqual([]);
    });

    test('the confirm dialog has no accessibility violations', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('tab', { name: 'Progress' }).click();
      await page.getByRole('button', { name: 'Reset all progress' }).click();
      await expect(page.getByRole('dialog', { name: 'Reset all progress?' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test('tabs can be used with the keyboard', async ({ page }) => {
  await page.goto('/');
  const practiceTab = page.getByRole('tab', { name: 'Practice' });
  await practiceTab.focus();
  await page.keyboard.press('ArrowRight');
  const progressTab = page.getByRole('tab', { name: 'Progress' });
  await expect(progressTab).toBeFocused();
  await expect(progressTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Progress' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Mistakes' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(practiceTab).toBeFocused();
  await expect(practiceTab).toHaveAttribute('tabindex', '0');
  await expect(progressTab).toHaveAttribute('tabindex', '-1');
});

test('confirm dialogs can be cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Mistakes' }).click();
  await page.getByRole('button', { name: 'Clear mistake history' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#confirm-dialog')).toBeHidden();
});
