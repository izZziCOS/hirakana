import { test as base, expect, type Page } from '@playwright/test';

export const STORAGE_KEY = 'kana-dojo';

type Seed = (state: object, key?: string) => Promise<void>;

export const test = base.extend<{ seed: Seed }>({
  seed: async ({ page }, use) => {
    await use(async (state, key = STORAGE_KEY) => {
      await page.addInitScript(
        ([storageKey, value]) => {
          if (sessionStorage.getItem('seeded')) return;
          localStorage.setItem(storageKey, value);
          sessionStorage.setItem('seeded', 'true');
        },
        [key, JSON.stringify(state)] as const,
      );
    });
  },
});

export { expect };

export const dayKey = (offsetDays = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(n => String(n).padStart(2, '0')).join('-');
};

export function savedStatKeys(page: Page): Promise<string[]> {
  return page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as { stats?: Record<string, unknown> };
    return Object.keys(saved.stats ?? {});
  }, STORAGE_KEY);
}

export async function confirmDialog(page: Page, button: string): Promise<void> {
  await page.locator('#confirm-dialog').getByRole('button', { name: button }).click();
}

export async function answer(page: Page, value: string): Promise<void> {
  await page.locator('#answer-input').fill(value);
  await page.locator('#answer-input').press('Enter');
}

export const prompt = (page: Page) => page.locator('#kana');
export const feedback = (page: Page) => page.locator('#feedback');
