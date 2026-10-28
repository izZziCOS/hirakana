import { answer, confirmDialog, expect, feedback, openApp, prompt, savedStatKeys, test } from './fixtures.ts';

const ANKI_EXPORT = [
  '#separator:tab',
  '#html:true',
  '猫[ねこ]\tneko\t<b>cat</b>',
  '水\tみず\twater',
  'not a word',
].join('\n');

const upload = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });

test('a word list can be imported, practised and deleted', async ({ page }) => {
  await openApp(page);
  const card = page.locator('.track', { has: page.locator('#track-decks') });
  await expect(card.getByRole('button', { name: 'Import a word list' })).toBeVisible();

  await page.locator('#deck-file').setInputFiles(upload('Genki 1.txt', ANKI_EXPORT));
  await expect(card).toContainText(
    'Added “Genki 1” with 2 words. 1 line without a kana word and a meaning was left out.',
  );
  await expect(card.locator('.deck-list li')).toHaveText([/Genki 1\s+2 words\s+Delete/]);
  await expect(page.locator('#hero-detail')).toContainText('Imported words');

  // The new deck's row is picked, and its words come before the basic kana that are new too.
  await page.locator('#continue-btn').click();
  for (const [word, romaji] of [
    ['ねこ', 'neko'],
    ['みず', 'mizu'],
  ] as const) {
    await expect(prompt(page)).toContainText(word);
    await answer(page, romaji);
    await expect(feedback(page)).toContainText('Correct!');
    await page.keyboard.press('Enter');
  }
  const deckKeys = async () => (await savedStatKeys(page)).filter(key => key.startsWith('@'));
  await expect.poll(deckKeys).toHaveLength(2);

  await page.locator('#home-btn').click();
  await card.getByRole('button', { name: 'Delete' }).click();
  await confirmDialog(page, 'Delete deck');
  await expect(card).toContainText('Deleted “Genki 1”.');
  await expect(card.locator('.deck-list')).toHaveCount(0);
  await expect.poll(deckKeys).toEqual([]);

  await page.reload();
  await expect(card.locator('.deck-list')).toHaveCount(0);
});

test('importing a deck again updates it and keeps progress on the words still in it', async ({ page }) => {
  await openApp(page);
  await page.locator('#deck-file').setInputFiles(upload('Lesson.csv', 'ねこ,cat\nいぬ,dog'));
  await page.locator('#continue-btn').click();
  await expect(prompt(page)).toContainText('ねこ');
  await answer(page, 'neko');
  await expect(feedback(page)).toContainText('Correct!');
  await page.locator('#home-btn').click();

  await page.locator('#deck-file').setInputFiles(upload('Lesson.csv', 'ねこ,cat\nとり,bird\nうま,horse'));
  await confirmDialog(page, 'Update');
  await expect(page.locator('.deck-status')).toHaveText('Updated “Lesson”: 3 words, 2 new and 1 removed.');
  await expect(page.locator('.deck-list li')).toHaveCount(1);
  await expect.poll(() => savedStatKeys(page)).toEqual([expect.stringMatching(/^@[a-z0-9]+\/ねこ$/)]);

  await page.locator('#deck-file').setInputFiles(upload('Lesson.csv', 'ねこ,cat'));
  await confirmDialog(page, 'Add as new');
  await expect(page.locator('.deck-list li')).toHaveCount(2);
});

test('a file without words says what a word list needs', async ({ page }) => {
  await openApp(page);
  await page.locator('#deck-file').setInputFiles(upload('notes.csv', 'just,some,notes'));
  await expect(page.locator('.deck-status')).toHaveText(
    'No words found in notes.csv. Each line needs a word in kana and its meaning.',
  );
});
