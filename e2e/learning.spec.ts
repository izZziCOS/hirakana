import { answer, expect, feedback, openApp, prompt, savedStatKeys, test } from './fixtures.ts';

const known = (box = 2) => ({ correct: 3, wrong: 0, streak: 3, box, due: Date.now() + 86_400_000, last: Date.now() });

test('a new character is introduced before it is tested', async ({ page, seed }) => {
  await seed({ version: 6, settings: { introduce: true, rows: ['basic:Vowels'] } });
  await openApp(page);
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toHaveText('あ');
  await expect(page.locator('#card-intro')).toHaveText('a');
  await expect(page.locator('#answer-form')).toBeHidden();
  await expect(page.locator('.stroke-count')).toHaveText('3 strokes');
  await page.keyboard.press('Enter');
  await expect(prompt(page)).toHaveText('い');
  await expect(page.locator('#learn-btn')).toBeVisible();
  await expect.poll(() => savedStatKeys(page)).toEqual(['あ']);

  await page.getByRole('button', { name: /Got it/ }).click();
  await expect(prompt(page)).toHaveText('う');
});

test('mixed practice shows each card’s direction', async ({ page, seed }) => {
  const due = { ...known(), due: Date.now() - 1000 };
  await seed({ version: 6, settings: { direction: 'mixed', rows: ['basic:Vowels'] }, stats: { 'recall:あ': due } });
  await openApp(page);
  await expect(page.locator('#hero-detail')).toHaveText(/^Mixed · Basic/);
  await page.locator('#continue-btn').click();
  await expect(page.locator('#card-script')).toContainText('Recall ·');
  await expect(prompt(page)).toHaveText('a');
  await answer(page, 'あ');
  await expect(feedback(page)).toContainText('Correct!');
});

test('the progress page lists the words you can read', async ({ page, seed }) => {
  const basics = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
  await seed({ version: 6, stats: Object.fromEntries(Array.from(basics).map(kana => [kana, known()])) });
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.locator('#readable')).toBeVisible();
  await expect(page.locator('#readable-h')).toContainText(/Words you can read: \d+/);
  await page.locator('#readable-words .readable-word').first().click();
  await expect(page.locator('#kana-dialog')).toBeVisible();
});

test('a kanji’s info lists its parts and other kanji built with them', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.locator('#progress-script [data-value="kanji"]').click();
  await page.locator('[data-expand="k5"]').click();
  await page.locator('#progress-grids .cell[data-kana="語"]').click();
  const body = page.locator('#dialog-body');
  await expect(body).toContainText('Parts');
  await expect(body.locator('[data-open="言"]')).toBeVisible();
  await expect(body).toContainText('Same parts in');
});
