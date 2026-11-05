import type { AdjectiveClass, AdjectiveForm, VerbClass, VerbForm } from './conjugate.ts';

// Common verbs and adjectives with their class, which the word list doesn't record. The kanji is empty for a word
// usually written in kana. New words go at the end of their list; a card is saved under its form and its word.

export interface VerbEntry {
  kana: string;
  kanji: string;
  verbClass: VerbClass;
  meaning: string;
  // Forms that aren't used with this verb, such as "can understand" for 分かる.
  skip?: VerbForm[];
}

export interface AdjectiveEntry {
  kana: string;
  kanji: string;
  adjectiveClass: AdjectiveClass;
  meaning: string;
  skip?: AdjectiveForm[];
}

const verbs = (verbClass: VerbClass, list: [string, string, string, VerbForm[]?][]): VerbEntry[] =>
  list.map(([kana, kanji, meaning, skip]) => ({ kana, kanji, verbClass, meaning, ...(skip ? { skip } : {}) }));

const adjectives = (
  adjectiveClass: AdjectiveClass,
  list: [string, string, string, AdjectiveForm[]?][],
): AdjectiveEntry[] =>
  list.map(([kana, kanji, meaning, skip]) => ({ kana, kanji, adjectiveClass, meaning, ...(skip ? { skip } : {}) }));

// Things that happen by themselves can't be done on purpose, be made possible or be made to happen in these forms.
const NOT_DONE_ON_PURPOSE: VerbForm[] = ['potential', 'volitional', 'passive', 'causative'];

export const VERBS: VerbEntry[] = [
  ...verbs('ichidan', [
    ['たべる', '食べる', 'to eat'],
    ['みる', '見る', 'to see, watch'],
    ['ねる', '寝る', 'to sleep'],
    ['おきる', '起きる', 'to get up'],
    ['あける', '開ける', 'to open (something)'],
    ['しめる', '閉める', 'to close (something)'],
    ['いれる', '入れる', 'to put in'],
    ['でる', '出る', 'to leave, go out'],
    ['おしえる', '教える', 'to teach, tell'],
    ['おぼえる', '覚える', 'to memorise'],
    ['わすれる', '忘れる', 'to forget'],
    ['かんがえる', '考える', 'to think about'],
    ['きる', '着る', 'to wear'],
    ['かりる', '借りる', 'to borrow'],
    ['あびる', '浴びる', 'to bathe in, take (a shower)'],
    ['おりる', '降りる', 'to get off'],
    ['つける', '付ける', 'to attach, turn on'],
    ['あげる', '', 'to give'],
    ['はじめる', '始める', 'to begin (something)'],
    ['やめる', '', 'to stop, quit'],
    ['しらべる', '調べる', 'to look into'],
    ['みせる', '見せる', 'to show'],
  ]),
  ...verbs('godan', [
    ['あう', '会う', 'to meet'],
    ['かう', '買う', 'to buy'],
    ['いう', '言う', 'to say'],
    ['すう', '吸う', 'to smoke, breathe in'],
    ['うたう', '歌う', 'to sing'],
    ['つかう', '使う', 'to use'],
    ['てつだう', '手伝う', 'to help'],
    ['ならう', '習う', 'to learn'],
    ['あらう', '洗う', 'to wash'],
    ['もらう', '', 'to receive'],
    ['おもう', '思う', 'to think'],
    ['いく', '行く', 'to go'],
    ['かく', '書く', 'to write'],
    ['きく', '聞く', 'to listen, ask'],
    ['あるく', '歩く', 'to walk'],
    ['はたらく', '働く', 'to work'],
    ['おく', '置く', 'to put'],
    ['なく', '泣く', 'to cry'],
    ['ひく', '弾く', 'to play (an instrument)'],
    ['つく', '着く', 'to arrive', ['potential', 'volitional', 'passive', 'causative']],
    ['およぐ', '泳ぐ', 'to swim'],
    ['いそぐ', '急ぐ', 'to hurry'],
    ['ぬぐ', '脱ぐ', 'to take off (clothes)'],
    ['はなす', '話す', 'to speak'],
    ['かす', '貸す', 'to lend'],
    ['だす', '出す', 'to take out, send'],
    ['けす', '消す', 'to turn off, erase'],
    ['さがす', '探す', 'to look for'],
    ['おす', '押す', 'to push'],
    ['なおす', '直す', 'to fix'],
    ['まつ', '待つ', 'to wait'],
    ['もつ', '持つ', 'to hold'],
    ['たつ', '立つ', 'to stand'],
    ['かつ', '勝つ', 'to win'],
    ['しぬ', '死ぬ', 'to die', ['potential', 'volitional', 'passive']],
    ['あそぶ', '遊ぶ', 'to play'],
    ['よぶ', '呼ぶ', 'to call'],
    ['とぶ', '飛ぶ', 'to fly'],
    ['えらぶ', '選ぶ', 'to choose'],
    ['はこぶ', '運ぶ', 'to carry'],
    ['ならぶ', '並ぶ', 'to line up'],
    ['のむ', '飲む', 'to drink'],
    ['よむ', '読む', 'to read'],
    ['すむ', '住む', 'to live'],
    ['やすむ', '休む', 'to rest'],
    ['たのむ', '頼む', 'to ask for'],
    ['かえる', '帰る', 'to go home'],
    ['はいる', '入る', 'to enter'],
    ['はしる', '走る', 'to run'],
    ['しる', '知る', 'to get to know', ['potential', 'volitional']],
    ['きる', '切る', 'to cut'],
    ['のる', '乗る', 'to ride'],
    ['とる', '取る', 'to take'],
    ['つくる', '作る', 'to make'],
    ['おわる', '終わる', 'to end', NOT_DONE_ON_PURPOSE],
    ['わかる', '分かる', 'to understand', NOT_DONE_ON_PURPOSE],
    ['すわる', '座る', 'to sit'],
    ['のぼる', '登る', 'to climb'],
    ['おくる', '送る', 'to send'],
    ['ふる', '降る', 'to fall (rain, snow)', NOT_DONE_ON_PURPOSE],
    ['まがる', '曲がる', 'to turn'],
  ]),
  ...verbs('suru', [
    ['する', '', 'to do'],
    ['べんきょうする', '勉強する', 'to study'],
    ['りょうりする', '料理する', 'to cook'],
    ['せんたくする', '洗濯する', 'to do the laundry'],
    ['そうじする', '掃除する', 'to clean'],
    ['さんぽする', '散歩する', 'to take a walk'],
    ['けっこんする', '結婚する', 'to marry'],
  ]),
  ...verbs('kuru', [['くる', '来る', 'to come']]),
];

export const ADJECTIVES: AdjectiveEntry[] = [
  ...adjectives('i', [
    ['おおきい', '大きい', 'big'],
    ['ちいさい', '小さい', 'small'],
    ['たかい', '高い', 'tall, expensive'],
    ['やすい', '安い', 'cheap'],
    ['あたらしい', '新しい', 'new'],
    ['ふるい', '古い', 'old'],
    ['あつい', '暑い', 'hot'],
    ['さむい', '寒い', 'cold'],
    ['いい', '', 'good'],
    ['わるい', '悪い', 'bad'],
    ['ながい', '長い', 'long'],
    ['みじかい', '短い', 'short'],
    ['はやい', '早い', 'early'],
    ['おそい', '遅い', 'late, slow'],
    ['おいしい', '', 'delicious'],
    ['むずかしい', '難しい', 'difficult'],
    ['やさしい', '優しい', 'kind'],
    ['たのしい', '楽しい', 'fun'],
    ['おもしろい', '面白い', 'interesting'],
    ['いそがしい', '忙しい', 'busy'],
    ['おもい', '重い', 'heavy'],
    ['かるい', '軽い', 'light'],
    ['ひろい', '広い', 'wide'],
    ['せまい', '狭い', 'narrow'],
    ['とおい', '遠い', 'far'],
    ['ちかい', '近い', 'near'],
    ['くろい', '黒い', 'black'],
    ['しろい', '白い', 'white'],
    ['あかい', '赤い', 'red'],
    ['つよい', '強い', 'strong'],
    ['よわい', '弱い', 'weak'],
    ['かわいい', '', 'cute'],
    ['うれしい', '嬉しい', 'glad'],
    ['かなしい', '悲しい', 'sad'],
    ['ほしい', '欲しい', 'wanted', ['adverb']],
  ]),
  ...adjectives('na', [
    ['げんき', '元気', 'healthy, lively'],
    // きれい and きらい end in い, but aren't い adjectives.
    ['きれい', '', 'pretty, clean'],
    ['しずか', '静か', 'quiet'],
    ['にぎやか', '', 'lively, busy'],
    ['ゆうめい', '有名', 'famous'],
    ['しんせつ', '親切', 'kind'],
    ['べんり', '便利', 'convenient'],
    ['ふべん', '不便', 'inconvenient'],
    ['かんたん', '簡単', 'simple'],
    ['たいへん', '大変', 'hard, tough'],
    ['だいじょうぶ', '大丈夫', 'all right', ['adverb']],
    ['すき', '好き', 'liked', ['adverb']],
    ['きらい', '嫌い', 'disliked', ['adverb']],
    ['じょうず', '上手', 'skilful'],
    ['へた', '下手', 'unskilful'],
    ['ひま', '暇', 'free, not busy', ['adverb']],
    ['まじめ', '真面目', 'serious'],
    ['だいじ', '大事', 'important'],
    ['たいせつ', '大切', 'important, precious'],
    ['じゆう', '自由', 'free'],
    ['あんぜん', '安全', 'safe'],
    ['ひつよう', '必要', 'necessary', ['adverb']],
  ]),
];

// What each form is for. Ids are saved with progress, so they never change.
export const VERB_FORM_INFO: Record<VerbForm, { id: string; label: string; meaning: string; note: string }> = {
  polite: {
    id: 'conj-polite',
    label: 'Polite ます',
    meaning: 'the polite present',
    note: 'る verbs (ichidan) drop る: たべる → たべます. う verbs (godan) move their last kana to the い row: かく → かきます. する → します, くる → きます.',
  },
  negative: {
    id: 'conj-negative',
    label: 'Negative ない',
    meaning: 'the plain negative: doesn’t, won’t',
    note: 'る verbs drop る: たべない. う verbs move to the あ row: かく → かかない, and an ending う becomes わ: かう → かわない. する → しない, くる → こない.',
  },
  past: {
    id: 'conj-past',
    label: 'Past た',
    meaning: 'the plain past: did',
    note: 'Made like the て form, with た for て and だ for で: かいて → かいた, のんで → のんだ.',
  },
  te: {
    id: 'conj-te',
    label: 'て form',
    meaning: 'links verbs; used in ～ています and ～てください',
    note: 'る verbs drop る: たべて. う, つ, る → って; む, ぶ, ぬ → んで; く → いて; ぐ → いで; す → して. いく is the exception: いって. する → して, くる → きて.',
  },
  potential: {
    id: 'conj-potential',
    label: 'Potential',
    meaning: 'can do',
    note: 'る verbs: たべられる. う verbs move to the え row and add る: かく → かける. する → できる, くる → こられる.',
  },
  volitional: {
    id: 'conj-volitional',
    label: 'Volitional',
    meaning: 'let’s; I’ll',
    note: 'る verbs: たべよう. う verbs move to the お row and add う: かく → かこう. する → しよう, くる → こよう.',
  },
  conditional: {
    id: 'conj-conditional',
    label: 'Conditional ば',
    meaning: 'if',
    note: 'る verbs: たべれば. う verbs move to the え row and add ば: かく → かけば. する → すれば, くる → くれば.',
  },
  passive: {
    id: 'conj-passive',
    label: 'Passive',
    meaning: 'is done to',
    note: 'る verbs: たべられる, the same as their potential. う verbs: the あ row + れる: かく → かかれる. する → される, くる → こられる.',
  },
  causative: {
    id: 'conj-causative',
    label: 'Causative',
    meaning: 'makes or lets someone do',
    note: 'る verbs: たべさせる. う verbs: the あ row + せる: かく → かかせる. する → させる, くる → こさせる.',
  },
};

export const ADJECTIVE_FORM_INFO: Record<AdjectiveForm, { id: string; label: string; meaning: string; note: string }> =
  {
    negative: {
      id: 'conj-adj-negative',
      label: 'Adjective, negative',
      meaning: 'isn’t',
      note: 'い adjectives: い → くない, たかい → たかくない. いい → よくない. な adjectives add じゃない or ではない: しずかじゃない.',
    },
    past: {
      id: 'conj-adj-past',
      label: 'Adjective, past',
      meaning: 'was',
      note: 'い adjectives: い → かった, たかい → たかかった. いい → よかった. な adjectives add だった: しずかだった.',
    },
    pastNegative: {
      id: 'conj-adj-past-negative',
      label: 'Adjective, past negative',
      meaning: 'wasn’t',
      note: 'い adjectives: い → くなかった, たかい → たかくなかった. な adjectives add じゃなかった or ではなかった.',
    },
    te: {
      id: 'conj-adj-te',
      label: 'Adjective, linking',
      meaning: 'is … and',
      note: 'い adjectives: い → くて, たかい → たかくて. な adjectives add で: しずかで.',
    },
    adverb: {
      id: 'conj-adj-adverb',
      label: 'Adjective, adverb',
      meaning: 'in a … way; becoming …',
      note: 'い adjectives: い → く, はやい → はやく. な adjectives add に: しずかに.',
    },
  };
