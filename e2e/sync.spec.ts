import type { BrowserContext } from '@playwright/test';
import { handleRequest, MAX_BYTES, memoryStore, type ProgressStore } from '../worker/sync.ts';
import { answer, confirmDialog, expect, feedback, savedStatKeys, start, test } from './fixtures.ts';

// playwright.config.ts builds the site with this as its sync server; requests to it are answered by the worker's code.
const SYNC_SERVER = 'http://sync.test';

function serveSync(context: BrowserContext, store: ProgressStore): Promise<unknown> {
  return context.route(`${SYNC_SERVER}/**`, async route => {
    const request = route.request();
    const body = request.postDataBuffer();
    const response = await handleRequest(
      new Request(request.url(), {
        method: request.method(),
        headers: request.headers(),
        body: body ? Uint8Array.from(body) : undefined,
      }),
      store,
      { allowedOrigin: '*', maxBytes: MAX_BYTES },
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

test('progress reaches another device through a sync link', async ({ page, context, browser }, testInfo) => {
  const store = memoryStore();
  await serveSync(context, store);
  await start(page);
  await answer(page, 'a');
  await expect(feedback(page)).toContainText('Correct!');

  await page.locator('#settings-btn').click();
  await page.getByRole('button', { name: 'Turn on sync' }).click();
  await expect(page.locator('#sync-status')).toHaveText('Synced just now.');
  const code = (await page.locator('#sync-code').textContent()) ?? '';
  expect(code).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);

  const laptop = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
  await serveSync(laptop, store);
  const other = await laptop.newPage();
  await other.goto(`/#sync=${code}`);
  await confirmDialog(other, 'Turn on sync');
  await expect.poll(() => savedStatKeys(other)).toEqual(['あ']);
  expect(new URL(other.url()).hash).toBe('');

  await other.locator('#settings-btn').click();
  await expect(other.locator('#sync-code')).toHaveText(code);
  await other.getByRole('button', { name: 'Turn off' }).click();
  await confirmDialog(other, 'Turn off');
  await expect(other.getByRole('button', { name: 'Turn on sync' })).toBeVisible();
  await laptop.close();
});

test('a mistyped sync code is explained', async ({ page }) => {
  await page.goto('/');
  await page.locator('#settings-btn').click();
  await page.locator('#sync-code-input').fill('hello');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('#sync-status')).toContainText('doesn’t look like a sync code');
});
