import { findKana, isKanji, statKey } from './kana.ts';
import { canReadKana, KNOWN_BOX } from './reading.ts';
import type { Stats } from './schedule.ts';
import { codePoints } from './util.ts';

// Short sentences to read, easiest first. Kanji are written with their reading as {漢字|かんじ}; sentences in kana only
// put spaces between words, as children's books do.
export const SENTENCES: [markup: string, english: string][] = [
  ['これは ねこ です。', 'This is a cat.'],
  ['それは いぬ ですか。', 'Is that a dog?'],
  ['はい、そうです。', 'Yes, that’s right.'],
  ['いいえ、ちがいます。', 'No, that’s not it.'],
  ['おはよう ございます。', 'Good morning.'],
  ['ありがとう ございます。', 'Thank you very much.'],
  ['すみません。', 'Excuse me.'],
  ['あの ひとは だれ ですか。', 'Who is that person?'],
  ['ここは どこ ですか。', 'Where is this?'],
  ['いま なんじ ですか。', 'What time is it now?'],
  ['コーヒーを ください。', 'A coffee, please.'],
  ['テレビを みます。', 'I watch TV.'],
  ['パンを たべます。', 'I eat bread.'],
  ['あさ ごはんを たべました。', 'I ate breakfast.'],
  ['きょうは いい てんき ですね。', 'Nice weather today, isn’t it?'],
  ['わたしは がくせい です。', 'I am a student.'],
  ['ちょっと まって ください。', 'Please wait a moment.'],
  ['また あした。', 'See you tomorrow.'],
  ['おいしい ケーキ ですね。', 'What a delicious cake.'],
  ['ホテルは えきの ちかく です。', 'The hotel is near the station.'],
  ['{私|わたし}は{学生|がくせい}です。', 'I am a student.'],
  ['{今日|きょう}は{月曜日|げつようび}です。', 'Today is Monday.'],
  ['{水|みず}を{飲|の}みます。', 'I drink water.'],
  ['{山|やま}に{行|い}きます。', 'I go to the mountains.'],
  ['{川|かわ}で{魚|さかな}を{見|み}ました。', 'I saw fish in the river.'],
  ['{父|ちち}は{会社員|かいしゃいん}です。', 'My father is an office worker.'],
  ['{先生|せんせい}は{教室|きょうしつ}にいます。', 'The teacher is in the classroom.'],
  ['{駅|えき}はどこですか。', 'Where is the station?'],
  ['{電車|でんしゃ}で{学校|がっこう}へ{行|い}きます。', 'I go to school by train.'],
  ['{本|ほん}を{読|よ}むのが{好|す}きです。', 'I like reading books.'],
  ['{雨|あめ}が{降|ふ}っています。', 'It is raining.'],
  ['{明日|あした}は{休|やす}みです。', 'Tomorrow is a day off.'],
  ['{子|こ}どもが{三人|さんにん}います。', 'I have three children.'],
  ['この{店|みせ}は{安|やす}いです。', 'This shop is cheap.'],
  ['{車|くるま}が{一台|いちだい}あります。', 'There is one car.'],
  ['{名前|なまえ}は{何|なん}ですか。', 'What is your name?'],
  ['{右|みぎ}に{曲|ま}がってください。', 'Please turn right.'],
  ['{左|ひだり}の{手|て}をあげてください。', 'Please raise your left hand.'],
  ['{天気|てんき}がいいですね。', 'The weather is nice, isn’t it?'],
  ['{大|おお}きい{犬|いぬ}がいます。', 'There is a big dog.'],
  ['{小|ちい}さい{花|はな}が{好|す}きです。', 'I like small flowers.'],
  ['{白|しろ}いシャツを{買|か}いました。', 'I bought a white shirt.'],
  ['{新|あたら}しいかばんがほしいです。', 'I want a new bag.'],
  ['{古|ふる}い{家|いえ}に{住|す}んでいます。', 'I live in an old house.'],
  ['{朝|あさ}ご{飯|はん}を{食|た}べましたか。', 'Did you eat breakfast?'],
  ['{今|いま}、{何時|なんじ}ですか。', 'What time is it now?'],
  ['{午後|ごご}{三時|さんじ}に{会|あ}いましょう。', 'Let’s meet at three in the afternoon.'],
  ['{毎朝|まいあさ}{六時|ろくじ}に{起|お}きます。', 'I get up at six every morning.'],
  ['{毎日|まいにち}{日本語|にほんご}を{勉強|べんきょう}します。', 'I study Japanese every day.'],
  ['{空|そら}が{青|あお}いです。', 'The sky is blue.'],
  ['{目|め}が{痛|いた}いです。', 'My eyes hurt.'],
  ['{口|くち}を{開|あ}けてください。', 'Please open your mouth.'],
  ['{外|そと}は{寒|さむ}いです。', 'It’s cold outside.'],
  ['{部屋|へや}が{暑|あつ}いです。', 'The room is hot.'],
  ['{道|みち}を{教|おし}えてください。', 'Please tell me the way.'],
  ['{兄|あに}は{背|せ}が{高|たか}いです。', 'My older brother is tall.'],
  ['{姉|あね}は{歌|うた}が{好|す}きです。', 'My older sister likes singing.'],
  ['{弟|おとうと}は{八歳|はっさい}です。', 'My younger brother is eight.'],
  ['{妹|いもうと}と{公園|こうえん}で{遊|あそ}びました。', 'I played in the park with my younger sister.'],
  ['{母|はは}は{料理|りょうり}が{上手|じょうず}です。', 'My mother is good at cooking.'],
  ['{友|とも}だちと{映画|えいが}を{見|み}ました。', 'I watched a film with a friend.'],
  ['{時間|じかん}がありません。', 'I don’t have time.'],
  ['お{金|かね}がたくさんあります。', 'I have a lot of money.'],
  ['この{言葉|ことば}の{意味|いみ}は{何|なん}ですか。', 'What does this word mean?'],
  ['{窓|まど}を{閉|し}めてください。', 'Please close the window.'],
  ['{電気|でんき}をつけてください。', 'Please turn on the light.'],
  ['{入口|いりぐち}はあちらです。', 'The entrance is over there.'],
  ['{出口|でぐち}はどこですか。', 'Where is the exit?'],
  ['{北|きた}へ{歩|ある}きましょう。', 'Let’s walk north.'],
  ['{金曜日|きんようび}に{手紙|てがみ}を{書|か}きました。', 'I wrote a letter on Friday.'],
  ['{来年|らいねん}、{日本|にほん}に{行|い}きたいです。', 'I want to go to Japan next year.'],
  ['{去年|きょねん}は{忙|いそが}しかったです。', 'Last year was busy.'],
  ['{夏|なつ}は{海|うみ}で{泳|およ}ぎます。', 'In summer I swim in the sea.'],
  ['{秋|あき}は{食|た}べ{物|もの}がおいしいです。', 'Food tastes good in autumn.'],
  ['{冬|ふゆ}は{雪|ゆき}が{多|おお}いです。', 'There is a lot of snow in winter.'],
  ['{春|はる}になると{花|はな}が{咲|さ}きます。', 'Flowers bloom when spring comes.'],
  ['{英語|えいご}を{少|すこ}し{話|はな}します。', 'I speak a little English.'],
  ['{英語|えいご}が{少|すこ}し{分|わ}かります。', 'I understand a little English.'],
  ['{肉|にく}と{野菜|やさい}を{買|か}いました。', 'I bought meat and vegetables.'],
  ['{牛乳|ぎゅうにゅう}を{飲|の}みたいです。', 'I want to drink some milk.'],
  ['{鳥|とり}が{木|き}の{上|うえ}にいます。', 'There is a bird up in the tree.'],
  ['{机|つくえ}の{下|した}に{猫|ねこ}がいます。', 'There is a cat under the desk.'],
  ['{新聞|しんぶん}を{読|よ}みますか。', 'Do you read the newspaper?'],
  ['{図書館|としょかん}で{本|ほん}を{借|か}りました。', 'I borrowed a book from the library.'],
  ['{病気|びょうき}なので{薬|くすり}を{飲|の}みました。', 'I was ill, so I took some medicine.'],
  ['{週末|しゅうまつ}に{東京|とうきょう}へ{行|い}きました。', 'I went to Tokyo at the weekend.'],
  ['{先週|せんしゅう}、{北海道|ほっかいどう}に{行|い}きました。', 'I went to Hokkaido last week.'],
  ['{郵便局|ゆうびんきょく}は{銀行|ぎんこう}の{隣|となり}です。', 'The post office is next to the bank.'],
  ['{彼|かれ}は{医者|いしゃ}です。', 'He is a doctor.'],
  ['{昨日|きのう}は{頭|あたま}が{痛|いた}かったです。', 'I had a headache yesterday.'],
  ['{駅|えき}まで{送|おく}りましょうか。', 'Shall I take you to the station?'],
  ['{写真|しゃしん}を{撮|と}ってもいいですか。', 'May I take a photo?'],
  ['ここでたばこを{吸|す}ってはいけません。', 'You mustn’t smoke here.'],
  ['{宿題|しゅくだい}を{忘|わす}れてしまいました。', 'I forgot my homework.'],
  ['{電話番号|でんわばんごう}を{教|おし}えてください。', 'Please tell me your phone number.'],
  ['この{仕事|しごと}は{大変|たいへん}です。', 'This job is hard work.'],
  ['{会議|かいぎ}は{何時|なんじ}に{始|はじ}まりますか。', 'What time does the meeting start?'],
  ['{晩|ばん}ご{飯|はん}の{後|あと}で{散歩|さんぽ}します。', 'I go for a walk after dinner.'],
  ['{空港|くうこう}までバスで{一時間|いちじかん}かかります。', 'It takes an hour to the airport by bus.'],
  ['{質問|しつもん}があれば{聞|き}いてください。', 'If you have a question, please ask.'],
  ['{風|かぜ}が{強|つよ}いので{気|き}をつけてください。', 'The wind is strong, so be careful.'],
  ['{急|いそ}がないと{間|ま}に{合|あ}いません。', 'If we don’t hurry, we won’t make it.'],
  ['{明日|あした}{雨|あめ}が{降|ふ}ったら、{家|いえ}にいます。', 'If it rains tomorrow, I’ll stay at home.'],
  ['{彼女|かのじょ}は{料理|りょうり}を{作|つく}るのが{得意|とくい}です。', 'She is good at cooking.'],
  ['{日本|にほん}の{文化|ぶんか}に{興味|きょうみ}があります。', 'I’m interested in Japanese culture.'],
  ['{旅行|りょこう}の{計画|けいかく}を{立|た}てています。', 'I’m planning a trip.'],
  ['{試験|しけん}に{合格|ごうかく}しました。', 'I passed the exam.'],
  ['{部長|ぶちょう}は{今|いま}{会議中|かいぎちゅう}です。', 'The manager is in a meeting right now.'],
  ['{将来|しょうらい}、{先生|せんせい}になりたいです。', 'I want to be a teacher in the future.'],
  ['{約束|やくそく}の{時間|じかん}に{遅|おく}れました。', 'I was late for the time we agreed.'],
  ['{荷物|にもつ}が{重|おも}くて{大変|たいへん}です。', 'My luggage is heavy, which is tough.'],
  ['お{祭|まつ}りはとても{楽|たの}しかったです。', 'The festival was great fun.'],
  ['{地図|ちず}を{見|み}ながら{歩|ある}きました。', 'I walked while looking at the map.'],
  ['{季節|きせつ}の{中|なか}で{秋|あき}が{一番|いちばん}{好|す}きです。', 'Of all the seasons, I like autumn best.'],
  ['{練習|れんしゅう}すれば{上手|じょうず}になります。', 'If you practise, you’ll get better.'],
  ['{説明|せつめい}を{聞|き}いて{安心|あんしん}しました。', 'I was relieved to hear the explanation.'],
  ['{最近|さいきん}、{運動|うんどう}{不足|ぶそく}です。', 'I haven’t been getting enough exercise lately.'],
  ['{信号|しんごう}が{青|あお}になったら{渡|わた}ってください。', 'Please cross when the light turns green.'],
  ['{必要|ひつよう}なものを{全部|ぜんぶ}{準備|じゅんび}しました。', 'I’ve got everything I need ready.'],
  ['{彼女|かのじょ}は{笑|わら}いながら{答|こた}えました。', 'She answered with a smile.'],
  [
    '{天気予報|てんきよほう}によると、{明日|あした}は{晴|は}れるそうです。',
    'The forecast says it will be sunny tomorrow.',
  ],
  ['{彼|かれ}の{意見|いけん}に{賛成|さんせい}です。', 'I agree with his opinion.'],
  ['{経済|けいざい}について{調|しら}べています。', 'I’m looking into the economy.'],
  ['{環境|かんきょう}を{守|まも}ることは{大切|たいせつ}です。', 'Protecting the environment is important.'],
];

// A run of text, with its reading when it is written in kanji.
export interface Segment {
  text: string;
  reading?: string;
}

export interface Sentence {
  segments: Segment[];
  english: string;
  // The sentence as it is written, without readings.
  text: string;
  kanji: string[];
}

const HAN = /\p{Script=Han}/u;

export function parseSentence(markup: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\{([^|}]+)\|([^}]+)\}/g;
  let last = 0;
  for (const match of markup.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: markup.slice(last, match.index) });
    segments.push({ text: match[1] ?? '', reading: match[2] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < markup.length) segments.push({ text: markup.slice(last) });
  return segments;
}

export const sentences: Sentence[] = SENTENCES.map(([markup, english]) => {
  const segments = parseSentence(markup);
  const text = segments.map(segment => segment.text).join('');
  return { segments, english, text, kanji: [...new Set(codePoints(text).filter(char => HAN.test(char)))] };
});

export const knowsKanji = (stats: Stats, kanji: string): boolean => {
  const item = findKana(kanji);
  return item !== undefined && isKanji(item) && (stats[statKey(item, 'read')]?.box ?? 0) >= KNOWN_BOX;
};

// Kana, apart from punctuation and the spaces between words.
const kanaOf = (sentence: Sentence): string =>
  sentence.segments
    .filter(segment => !segment.reading)
    .map(segment => segment.text.replace(/[^ぁ-ゖァ-ヺー]/g, ''))
    .join('');

// Someone learning kanji who has never practised kana here is taken to know them already.
function knowsKanaAlready(stats: Stats): boolean {
  let kanji = false;
  for (const key of Object.keys(stats)) {
    const item = findKana(key);
    if (item && !isKanji(item) && (stats[key]?.box ?? 0) > 0) return false;
    kanji ||= item !== undefined && isKanji(item) && (stats[key]?.box ?? 0) >= KNOWN_BOX;
  }
  return kanji;
}

// Sentences whose kanji and kana are all ones the learner knows.
export function readableSentences(stats: Stats): Sentence[] {
  const kanaKnown = knowsKanaAlready(stats);
  return sentences.filter(
    sentence =>
      sentence.kanji.every(kanji => knowsKanji(stats, kanji)) && (kanaKnown || canReadKana(kanaOf(sentence), stats)),
  );
}
