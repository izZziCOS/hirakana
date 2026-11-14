import { expect, openApp, savedText, showTrack, test } from './fixtures.ts';

const learned = { correct: 1, wrong: 0, streak: 1, box: 2, due: Date.now() + 86_400_000, last: Date.now() };

test('the Read tab shows the sentences the learner can read, with readings over new kanji', async ({ page, seed }) => {
  const kana = Array.from(
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんで',
  );
  await seed({
    version: 7,
    stats: Object.fromEntries([...kana, '私', '学', '生'].map(id => [id, learned])),
  });
  await openApp(page);
  await page.getByRole('tab', { name: 'Read' }).click();

  const list = page.locator('#sentence-list');
  await expect(page.locator('#reader-summary')).toContainText(/You can read \d+ of the \d+ sentences/);
  // A sentence's text includes the readings in <rt>, so sentences are found by their meaning.
  const student = list.locator('.sentence', { hasText: 'I am a student.' });
  await expect(student.locator('.sentence-text')).toHaveText(/私\s*わたし\s*は\s*学生\s*がくせい\s*です。/);
  await expect(student).toBeVisible();
  // Every kanji here is known, so no reading shows until a word is selected.
  await expect(student.locator('.sentence-word.show-reading')).toHaveCount(0);
  await student.locator('.sentence-word', { hasText: '学生' }).click();
  await expect(student.locator('.sentence-word', { hasText: '学生' })).toHaveAttribute('aria-pressed', 'true');
  await student.getByText('Meaning').click();
  await expect(student).toContainText('I am a student.');

  // All sentences, with readings over the kanji not learned yet.
  await page.locator('#reader-show').getByRole('button', { name: 'All' }).click();
  const water = list.locator('.sentence', { hasText: 'I drink water.' });
  await expect(water.locator('.sentence-word.show-reading')).toHaveCount(2);
  await page.locator('#reader-furigana').getByRole('button', { name: 'None' }).click();
  await expect(water.locator('.sentence-word.show-reading')).toHaveCount(0);
});

test('the full JLPT word list loads in the background', async ({ page }) => {
  await openApp(page);
  const vocabulary = page.locator('.track', { has: page.locator('#track-vocabulary') });
  await showTrack(page, 'vocabulary');
  await expect(vocabulary.locator('[data-group="n5"]')).toContainText(/5\d\d cards/);
  await vocabulary.getByRole('button', { name: 'Choose rows' }).click();
  await vocabulary.locator('[data-expand="n5"]').click();
  await vocabulary.locator('[data-row="n5:N5 · 1–30"]').click();
  await expect(vocabulary.locator('[data-row="n5:N5 · 1–30"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#hero-detail')).toContainText('JLPT N5 words');
});

test('a word tapped in the Read tab can be saved to learn, and is practised first', async ({ page, seed }) => {
  await seed({ version: 11, settings: { rows: ['basic:Vowels'], introduce: false } });
  await openApp(page);
  await page.getByRole('tab', { name: 'Read' }).click();
  await page.locator('#reader-show').getByRole('button', { name: 'All' }).click();
  // The first sentence with 学生 in kanji, as another one is written in kana.
  const student = page
    .locator('#sentence-list .sentence', { has: page.locator('.sentence-word', { hasText: '学生' }) })
    .first();
  await student.locator('.sentence-word', { hasText: '学生' }).click();
  const panel = student.locator('.word-pick');
  await expect(panel).toContainText('がくせい');
  await expect(panel).toContainText('student');
  await panel.getByRole('button', { name: '+ Learn this' }).click();
  await expect(panel.getByRole('button', { name: '✓ Saved to learn' })).toHaveAttribute('aria-pressed', 'true');

  // A verb in the middle of a sentence is found in its dictionary form.
  const drink = page.locator('#sentence-list .sentence', { hasText: 'I drink water.' }).first();
  await drink.locator('.sentence-word', { hasText: '飲' }).click();
  await expect(drink.locator('.word-pick')).toContainText('飲む');
  await expect(drink.locator('.word-pick')).toContainText('to drink');

  await page.getByRole('tab', { name: 'Learn' }).click();
  await expect(page.locator('.track', { has: page.locator('#track-decks') })).toContainText('Saved from reading');
  await page.locator('#continue-btn').click();
  await expect(page.locator('#kana')).toContainText('学生');

  // Its details panel can let it go again.
  await page.locator('#info summary').click();
  await page.getByRole('button', { name: 'Remove from saved' }).click();
  await expect.poll(async () => (await savedText(page))?.includes('"on":false')).toBe(true);
});
