import { dayKey, expect, openApp, prompt, test } from './fixtures.ts';

const DAY = 86_400_000;
const BASIC_ROWS = ['Vowels', 'K-row', 'S-row', 'T-row', 'N-row', 'H-row', 'M-row', 'Y-row', 'R-row', 'W-row', 'N'].map(
  row => `basic:${row}`,
);
// Known well, last seen a few days ago and due since yesterday.
const review = { correct: 5, wrong: 0, streak: 5, box: 5, due: Date.now() - DAY, last: Date.now() - 4 * DAY };
const reviewsOf = (kana: string) => Object.fromEntries(Array.from(kana, k => [k, review]));
const HIRAGANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';

test('the daily review limit is set in Settings', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const limit = page.locator('#reviews-per-day');
  await expect(limit.locator('[data-value="0"]')).toHaveAttribute('aria-pressed', 'true');
  await limit.locator('[data-value="100"]').click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(limit.locator('[data-value="100"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a backlog of reviews can be spread over the next days', async ({ page, seed }) => {
  // 60 reviews due, with a limit of 50 a day.
  await seed({
    version: 8,
    settings: { rows: BASIC_ROWS, script: 'both', reviewsPerDay: 50 },
    stats: reviewsOf(`${HIRAGANA}アイウエオカキクケコサシスセ`),
  });
  await openApp(page);
  const note = page.locator('#catch-up-note');
  await expect(note).toBeVisible();
  await expect(note.locator('#catch-up-title')).toHaveText('60 reviews due');
  await expect(note).toContainText('Catch up over 5 days instead: about 12 a day');
  await expect(page.locator('#hero-title')).toHaveText('50 reviews due, 15 new to learn');

  await note.getByRole('button', { name: 'Spread over 5 days' }).click();
  await expect(note).toBeHidden();
  await expect(page.locator('#hero-title')).toHaveText('12 reviews due, 15 new to learn');
  await page.reload();
  await expect(page.locator('#hero-title')).toHaveText('12 reviews due, 15 new to learn');
  await expect(note).toBeHidden();
});

test('past the daily limit, reviews wait for tomorrow unless more are asked for', async ({ page, seed }) => {
  await seed({
    version: 8,
    settings: { rows: ['basic:Vowels'], reviewsPerDay: 50 },
    stats: reviewsOf('あいうえお'),
    days: { [dayKey()]: { answers: 50, learned: 0, reviews: 50, scored: 50, correct: 50 } },
  });
  await openApp(page);
  await expect(page.locator('#hero-title')).toHaveText('All caught up for now');
  await expect(page.locator('#catch-up-note')).toBeHidden();
  await page.locator('#continue-btn').click();

  const done = page.locator('#done');
  await expect(done).toContainText('5 more reviews are due, waiting for tomorrow: you reached your limit of 50 today.');
  await done.getByRole('button', { name: 'Review 5 more' }).click();
  await expect(page.locator('#card-badge')).toHaveText('Review');
  await expect(prompt(page)).toHaveText(/^[あいうえお]$/);
  await expect(page.locator('#session')).toContainText('Reviews today 50/75');
});
