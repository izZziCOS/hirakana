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

// What the app saved under a key in IndexedDB, as text, or null. The app moves anything a test seeds in localStorage
// there when it starts.
export function savedText(page: Page, key = STORAGE_KEY): Promise<string | null> {
  return page.evaluate(
    key =>
      new Promise<string | null>(resolve => {
        const request = indexedDB.open('kana-dojo');
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('progress')) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction('progress').objectStore('progress').get(key);
          get.onsuccess = () => {
            db.close();
            resolve(typeof get.result === 'string' ? get.result : null);
          };
          get.onerror = () => resolve(null);
        };
      }),
    key,
  );
}

export async function savedProgress(page: Page): Promise<Record<string, unknown>> {
  return JSON.parse((await savedText(page)) ?? '{}') as Record<string, unknown>;
}

// Saves progress as another tab of the app would: into IndexedDB, then telling the other tabs.
export function saveAsOtherTab(page: Page, value: string): Promise<void> {
  return page.evaluate(
    ([key, value]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('kana-dojo');
        request.onerror = () => reject(new Error('IndexedDB'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('progress', 'readwrite');
          transaction.objectStore('progress').put(value, key);
          transaction.oncomplete = () => {
            db.close();
            const channel = new BroadcastChannel('kana-dojo-progress');
            channel.postMessage(key);
            channel.close();
            resolve();
          };
        };
      }),
    [STORAGE_KEY, value] as const,
  );
}

export async function savedStatKeys(page: Page): Promise<string[]> {
  return Object.keys((await savedProgress(page)).stats ?? {});
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

// A track with nothing turned on is folded on the home screen until it is opened.
export async function showTrack(page: Page, id: string): Promise<void> {
  await page.locator(`[data-show-track="${id}"][aria-expanded="false"]`).click();
}

export const prompt = (page: Page) => page.locator('#kana');
export const feedback = (page: Page) => page.locator('#feedback');
