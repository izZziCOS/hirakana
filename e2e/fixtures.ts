import { test as base, expect, type Page } from '@playwright/test';

export const STORAGE_KEY = 'kana-dojo';

type Seed = (state: object, key?: string) => Promise<void>;

// Most tests practise without the introduction of new characters; a seeded state can turn it back on.
const withoutIntros = (state: object): object => {
  const settings = 'settings' in state && typeof state.settings === 'object' ? state.settings : {};
  return { ...state, settings: { introduce: false, ...settings } };
};

export const test = base.extend<{ seed: Seed }>({
  seed: async ({ page }, use) => {
    await use(async (state, key = STORAGE_KEY) => {
      await page.addInitScript(
        ([storageKey, value]) => {
          if (sessionStorage.getItem('seeded')) return;
          localStorage.setItem(storageKey, value);
          sessionStorage.setItem('seeded', 'true');
        },
        [key, JSON.stringify(withoutIntros(state))] as const,
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

// Opens the app. Without saved progress it starts with the introduction of new characters turned off, like seed().
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.addInitScript(key => {
    if (localStorage.getItem(key) === null && localStorage.getItem(`${key}-v1`) === null) {
      localStorage.setItem(key, JSON.stringify({ version: 6, settings: { introduce: false } }));
    }
  }, STORAGE_KEY);
  await page.goto(path);
}

// The Learn tab opens on the home screen; Continue starts (or resumes) practice.
export async function start(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('#continue-btn').click();
}

export const prompt = (page: Page) => page.locator('#kana');
export const feedback = (page: Page) => page.locator('#feedback');
