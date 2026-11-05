// Conjugates verbs and adjectives from their dictionary form. The word list doesn't say what class a word is, and that
// can't be told from its spelling (帰る is godan, 食べる ichidan), so conjugation-data.ts gives each word's class.

export type VerbClass = 'godan' | 'ichidan' | 'suru' | 'kuru';
export type AdjectiveClass = 'i' | 'na';
export type VerbForm =
  'polite' | 'negative' | 'past' | 'te' | 'potential' | 'volitional' | 'conditional' | 'passive' | 'causative';
export type AdjectiveForm = 'negative' | 'past' | 'pastNegative' | 'te' | 'adverb';

export const VERB_FORMS: VerbForm[] = [
  'polite',
  'negative',
  'past',
  'te',
  'potential',
  'volitional',
  'conditional',
  'passive',
  'causative',
];
export const ADJECTIVE_FORMS: AdjectiveForm[] = ['negative', 'past', 'pastNegative', 'te', 'adverb'];

export interface Inflected {
  // Every right answer in kana, the usual one first.
  kana: string[];
  // The same answers with the word's kanji.
  kanji: string[];
}

// The kana of each godan ending in the a, i, e and o rows.
const GODAN_ROWS: Record<string, [a: string, i: string, e: string, o: string]> = {
  う: ['わ', 'い', 'え', 'お'],
  く: ['か', 'き', 'け', 'こ'],
  ぐ: ['が', 'ぎ', 'げ', 'ご'],
  す: ['さ', 'し', 'せ', 'そ'],
  つ: ['た', 'ち', 'て', 'と'],
  ぬ: ['な', 'に', 'ね', 'の'],
  ぶ: ['ば', 'び', 'べ', 'ぼ'],
  む: ['ま', 'み', 'め', 'も'],
  る: ['ら', 'り', 'れ', 'ろ'],
};
const TE_ENDINGS: Record<string, string> = {
  う: 'って',
  つ: 'って',
  る: 'って',
  む: 'んで',
  ぶ: 'んで',
  ぬ: 'んで',
  く: 'いて',
  ぐ: 'いで',
  す: 'して',
};
const ICHIDAN_ENDINGS: Record<VerbForm, string> = {
  polite: 'ます',
  negative: 'ない',
  past: 'た',
  te: 'て',
  potential: 'られる',
  volitional: 'よう',
  conditional: 'れば',
  passive: 'られる',
  causative: 'させる',
};
const SURU_FORMS: Record<VerbForm, string> = {
  polite: 'します',
  negative: 'しない',
  past: 'した',
  te: 'して',
  potential: 'できる',
  volitional: 'しよう',
  conditional: 'すれば',
  passive: 'される',
  causative: 'させる',
};
const KURU_KANA: Record<VerbForm, string> = {
  polite: 'きます',
  negative: 'こない',
  past: 'きた',
  te: 'きて',
  potential: 'こられる',
  volitional: 'こよう',
  conditional: 'くれば',
  passive: 'こられる',
  causative: 'こさせる',
};

const toPast = (te: string): string => te.replace(/て$/, 'た').replace(/で$/, 'だ');

// The ending that replaces a godan verb's last kana. 行く is the one verb that doesn't follow the rule for its て form.
function godanEnding(last: string, form: VerbForm, iku: boolean): string {
  const row = GODAN_ROWS[last];
  if (!row) throw new Error(`Not a godan ending: ${last}`);
  const [a, i, e, o] = row;
  const te = iku ? 'って' : (TE_ENDINGS[last] ?? '');
  return {
    polite: `${i}ます`,
    negative: `${a}ない`,
    past: toPast(te),
    te,
    potential: `${e}る`,
    volitional: `${o}う`,
    conditional: `${e}ば`,
    passive: `${a}れる`,
    causative: `${a}せる`,
  }[form];
}

const isIku = (kana: string): boolean => kana === 'いく';

export function conjugateVerb(kana: string, kanji: string, verbClass: VerbClass, form: VerbForm): Inflected {
  const swap = (cut: number, ending: string): Inflected => ({
    kana: [kana.slice(0, -cut) + ending],
    kanji: [kanji.slice(0, -cut) + ending],
  });
  if (verbClass === 'kuru') {
    // 来 is read differently in each form, so only the kana change completely.
    return { kana: [KURU_KANA[form]], kanji: [`${kanji.slice(0, -1)}${ICHIDAN_ENDINGS[form]}`] };
  }
  if (verbClass === 'suru') return swap(2, SURU_FORMS[form]);
  if (verbClass === 'ichidan') return swap(1, ICHIDAN_ENDINGS[form]);
  return swap(1, godanEnding(kana.slice(-1), form, isIku(kana)));
}

const I_ENDINGS: Record<AdjectiveForm, string> = {
  negative: 'くない',
  past: 'かった',
  pastNegative: 'くなかった',
  te: 'くて',
  adverb: 'く',
};
const NA_ENDINGS: Record<AdjectiveForm, string[]> = {
  negative: ['じゃない', 'ではない'],
  past: ['だった'],
  pastNegative: ['じゃなかった', 'ではなかった'],
  te: ['で'],
  adverb: ['に'],
};

export function conjugateAdjective(
  kana: string,
  kanji: string,
  adjectiveClass: AdjectiveClass,
  form: AdjectiveForm,
): Inflected {
  if (adjectiveClass === 'na') {
    const endings = NA_ENDINGS[form];
    return { kana: endings.map(ending => kana + ending), kanji: endings.map(ending => kanji + ending) };
  }
  // いい takes its forms from よい.
  if (kana === 'いい') return { kana: [`よ${I_ENDINGS[form]}`], kanji: [`よ${I_ENDINGS[form]}`] };
  return { kana: [kana.slice(0, -1) + I_ENDINGS[form]], kanji: [kanji.slice(0, -1) + I_ENDINGS[form]] };
}

// Wrong answers worth telling apart from the right one: the same form as if the verb were of another class, or with
// another て ending, come first, as those are the mistakes people make.
export function verbNearMisses(kana: string, verbClass: VerbClass, form: VerbForm): string[] {
  const misses: string[] = [];
  if (verbClass === 'godan' && kana.endsWith('る')) misses.push(kana.slice(0, -1) + ICHIDAN_ENDINGS[form]);
  if (verbClass === 'ichidan') misses.push(kana.slice(0, -1) + godanEnding('る', form, false));
  if (verbClass === 'godan' && (form === 'te' || form === 'past')) {
    const last = kana.slice(-1);
    for (const ending of new Set(Object.values(TE_ENDINGS))) {
      misses.push(kana.slice(0, -1) + (form === 'past' ? toPast(ending) : ending));
    }
    // The plain stem + て, which is the classic beginner's mistake (かきて for かいて).
    misses.unshift(`${kana.slice(0, -1)}${GODAN_ROWS[last]?.[1] ?? ''}${form === 'past' ? 'た' : 'て'}`);
  }
  return misses;
}

// Wrong answers for an adjective: the endings of the other class, as い and な adjectives are easily mixed up.
export function adjectiveNearMisses(kana: string, adjectiveClass: AdjectiveClass, form: AdjectiveForm): string[] {
  if (adjectiveClass === 'na') return [kana + I_ENDINGS[form]];
  const stem = kana === 'いい' ? 'よ' : kana.slice(0, -1);
  return [kana + (NA_ENDINGS[form][0] ?? ''), stem + (NA_ENDINGS[form][0] ?? '')];
}
