import { registerKanji, registerVocabulary } from './kana.ts';
import { KANJI_DATA } from './kanji-data.ts';
import { KANJI_PARTS } from './kanji-parts.ts';
import { VOCAB_DATA } from './vocab-data.ts';

registerKanji(KANJI_DATA, KANJI_PARTS);
registerVocabulary(VOCAB_DATA);
