import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { dayKey, expect, openApp, start, test } from './fixtures.ts';

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

    test('the home screen, with a track open and the settings dialog, has no accessibility violations', async ({
      page,
      seed,
    }) => {
      await seed(history);
      await openApp(page);
      await page.locator('[data-track="kanji"]').click();
      await page.locator('[data-expand="k5"]').click();
      await expect(page.locator('[data-row="k5:N5 · 1–30"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.locator('#settings-dialog')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('practice, with the info panel open, has no accessibility violations', async ({ page }) => {
      await start(page);
      await page.locator('#info summary').click();
      await expect(page.locator('.stroke-count')).toHaveText('3 strokes');
      expect(await violations(page)).toEqual([]);
    });

    test('a wrong answer and multiple choice have no accessibility violations', async ({ page }) => {
      await openApp(page);
      await page.getByRole('button', { name: 'Multiple choice' }).click();
      await page.locator('#continue-btn').click();
      await page.locator('#choices .choice:not([data-value="a"])').first().click();
      await expect(page.locator('#undo-btn')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('progress and mistakes have no accessibility violations', async ({ page, seed }) => {
      await seed(history);
      await openApp(page);
      await page.getByRole('tab', { name: 'Progress' }).click();
      await expect(page.locator('.heat-cell').first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('tab', { name: 'Mistakes' }).click();
      await expect(page.locator('.pair-card')).toHaveCount(1);
      expect(await violations(page)).toEqual([]);
    });

    test('the reader and an imported deck have no accessibility violations', async ({ page, seed }) => {
      await seed({
        version: 7,
        decks: [{ id: 'genki', name: 'Genki 1', words: [{ kana: 'ねこ', kanji: '猫', meaning: 'cat' }], addedAt: 1 }],
        settings: { rows: ['basic:Vowels', 'custom:genki'] },
      });
      await openApp(page);
      await page.locator('[data-track="decks"]').click();
      await expect(page.locator('[data-delete-deck="genki"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('tab', { name: 'Read' }).click();
      await page.locator('#reader-show').getByRole('button', { name: 'All' }).click();
      await expect(page.locator('.sentence-word.show-reading').first()).toBeVisible();
      await page.locator('.sentence details summary').first().click();
      expect(await violations(page)).toEqual([]);
    });

    test('the confirm dialog has no accessibility violations', async ({ page }) => {
      await openApp(page);
      await page.getByRole('tab', { name: 'Progress' }).click();
      await page.getByRole('button', { name: 'Reset all progress' }).click();
      await expect(page.getByRole('dialog', { name: 'Reset all progress?' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test('tabs can be used with the keyboard', async ({ page }) => {
  await openApp(page);
  const practiceTab = page.getByRole('tab', { name: 'Learn' });
  await practiceTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Read' })).toBeFocused();
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
  await openApp(page);
  await page.getByRole('tab', { name: 'Mistakes' }).click();
  await page.getByRole('button', { name: 'Clear mistake history' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#confirm-dialog')).toBeHidden();
});
