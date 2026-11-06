# Recorded pronunciations

Recordings of the kana and of the everyday and JLPT N5 words, so these cards can be heard without a Japanese voice in
the browser. `SOURCES.tsv` lists every file with its author, licence and original.

- **Tofugu and WaniKani:** [japanese-vocabulary-pronunciation-audio](https://github.com/tofugu/japanese-vocabulary-pronunciation-audio),
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). A mix of two native speakers, as that project
  describes them: a male professional voice actor with a Tokyo accent and a female amateur voice actor with a Kansai
  accent. Used only where its spelling and reading both match a card exactly.
- **Lingua Libre speakers Fukujinzuke, 葵心 and CKali:** from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-jpn),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) or [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
  as listed for each file. Used for single kana and for words spelled in kana, where what was said is certain. Katakana
  use the recording of the hiragana with the same sound.

**Changes made to the originals:** silence trimmed from both ends, the level evened out, and converted to mono MP3 at
24 kHz and 48 kbit/s. These files are distributed under the same licence as their originals.

Refresh them with `node scripts/fetch-audio.ts`, which needs ffmpeg and rewrites `src/audio-data.ts`. It checks each
Lingua Libre file's licence and skips anything else, and rejects clips that are silent or outside 0.1 to 4 seconds.
