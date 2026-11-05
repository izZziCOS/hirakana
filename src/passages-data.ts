// Short graded passages for the Read tab, written for this app. Kanji have their reading as {漢字|かんじ}, and each
// paragraph has its meaning. Ids are saved with progress. Loaded on demand (see src/ui/passages.ts).

export interface PassageQuestion {
  question: string;
  options: string[];
  // The position of the right option.
  answer: number;
}

export interface Passage {
  id: string;
  level: 1 | 2 | 3 | 4 | 5;
  title: string;
  english: string;
  paragraphs: [markup: string, english: string][];
  questions: PassageQuestion[];
}

export const PASSAGES: Passage[] = [
  {
    id: 'my-cat',
    level: 5,
    title: 'わたしの ねこ',
    english: 'My cat',
    paragraphs: [
      [
        'わたしの いえに ねこが います。なまえは ミミです。ミミは しろくて、ちいさいです。',
        'There is a cat at my house. Her name is Mimi. Mimi is white and small.',
      ],
      [
        'ミミは さかなが すきです。ひるは ソファで ねて、よるは げんきに あそびます。',
        'Mimi likes fish. In the daytime she sleeps on the sofa, and at night she plays energetically.',
      ],
      [
        'きのう ミミは たかい きに のぼりました。でも、おりることが できませんでした。ちちが たすけました。',
        'Yesterday Mimi climbed a tall tree. But she couldn’t get down. My father helped her.',
      ],
    ],
    questions: [
      {
        question: 'What does Mimi look like?',
        options: ['Black and big', 'White and small', 'White and big'],
        answer: 1,
      },
      { question: 'When does Mimi play?', options: ['In the morning', 'In the daytime', 'At night'], answer: 2 },
      {
        question: 'What happened yesterday?',
        options: ['Mimi couldn’t get down from a tree', 'Mimi caught a fish', 'Mimi ran away from home'],
        answer: 0,
      },
    ],
  },
  {
    id: 'my-day',
    level: 5,
    title: '{私|わたし}の{一日|いちにち}',
    english: 'My day',
    paragraphs: [
      [
        '{私|わたし}は{毎朝|まいあさ}{七時|しちじ}に{起|お}きます。{朝|あさ}ごはんを{食|た}べて、{八時|はちじ}に{家|いえ}を{出|で}ます。',
        'I get up at seven every morning. I eat breakfast and leave home at eight.',
      ],
      [
        '{学校|がっこう}まで{電車|でんしゃ}で{三十分|さんじゅっぷん}です。{学校|がっこう}で{日本語|にほんご}を{勉強|べんきょう}します。',
        'It’s thirty minutes to school by train. At school I study Japanese.',
      ],
      [
        '{午後|ごご}は{友達|ともだち}と{図書館|としょかん}へ{行|い}きます。{夜|よる}は{家族|かぞく}と{晩|ばん}ごはんを{食|た}べて、{十一時|じゅういちじ}に{寝|ね}ます。',
        'In the afternoon I go to the library with a friend. At night I eat dinner with my family and go to bed at eleven.',
      ],
    ],
    questions: [
      { question: 'How does the writer get to school?', options: ['By bus', 'On foot', 'By train'], answer: 2 },
      { question: 'What does the writer study?', options: ['Japanese', 'English', 'Maths'], answer: 0 },
      {
        question: 'Where does the writer go in the afternoon?',
        options: ['Home', 'The library', 'A friend’s house'],
        answer: 1,
      },
    ],
  },
  {
    id: 'shopping',
    level: 5,
    title: '{土曜日|どようび}の{買|か}い{物|もの}',
    english: 'Saturday shopping',
    paragraphs: [
      [
        '{土曜日|どようび}に{母|はは}とデパートへ{行|い}きました。{私|わたし}は{青|あお}いかばんを{買|か}いました。{五千円|ごせんえん}でした。',
        'On Saturday I went to a department store with my mother. I bought a blue bag. It was five thousand yen.',
      ],
      [
        '{母|はは}は{靴|くつ}を{見|み}ましたが、{高|たか}かったです。{買|か}いませんでした。',
        'My mother looked at shoes, but they were expensive. She didn’t buy any.',
      ],
      [
        '{昼|ひる}はレストランで{魚|さかな}を{食|た}べました。とてもおいしかったです。',
        'For lunch we ate fish at a restaurant. It was very good.',
      ],
    ],
    questions: [
      { question: 'What did the writer buy?', options: ['Shoes', 'A blue bag', 'A fish'], answer: 1 },
      {
        question: 'Why didn’t the mother buy the shoes?',
        options: ['They were expensive', 'They were too small', 'She didn’t like the colour'],
        answer: 0,
      },
      { question: 'What did they eat?', options: ['Meat', 'Rice balls', 'Fish'], answer: 2 },
    ],
  },
  {
    id: 'kyoto-trip',
    level: 4,
    title: '{初|はじ}めての{一人旅|ひとりたび}',
    english: 'My first trip alone',
    paragraphs: [
      [
        '{先月|せんげつ}、{初|はじ}めて{一人|ひとり}で{京都|きょうと}へ{旅行|りょこう}に{行|い}きました。{新幹線|しんかんせん}の{中|なか}で{駅弁|えきべん}を{食|た}べながら、{外|そと}の{景色|けしき}を{見|み}ていました。',
        'Last month I went on a trip to Kyoto alone for the first time. On the bullet train I ate a station lunch box while looking at the scenery outside.',
      ],
      [
        '{京都|きょうと}には{古|ふる}いお{寺|てら}がたくさんあります。{道|みち}が{分|わ}からなくなったとき、{親切|しんせつ}なおばあさんが{教|おし}えてくれました。',
        'Kyoto has many old temples. When I lost my way, a kind old woman told me how to go.',
      ],
      [
        '{一人|ひとり}の{旅行|りょこう}も{楽|たの}しかったですが、{次|つぎ}は{友達|ともだち}といっしょに{行|い}きたいと{思|おも}います。',
        'Travelling alone was fun, but next time I’d like to go with a friend.',
      ],
    ],
    questions: [
      {
        question: 'What did the writer do on the train?',
        options: ['Slept the whole way', 'Ate while looking outside', 'Talked with a friend'],
        answer: 1,
      },
      {
        question: 'Who helped when the writer got lost?',
        options: ['A kind old woman', 'A police officer', 'A temple priest'],
        answer: 0,
      },
      {
        question: 'What would the writer like to do next time?',
        options: ['Stay longer in Kyoto', 'Travel alone again', 'Go with a friend'],
        answer: 2,
      },
    ],
  },
  {
    id: 'part-time-job',
    level: 4,
    title: 'コンビニのアルバイト',
    english: 'A part-time job at a convenience store',
    paragraphs: [
      [
        '{私|わたし}は{大学|だいがく}に{通|かよ}いながら、{週|しゅう}に{三回|さんかい}コンビニでアルバイトをしています。{最初|さいしょ}はお{客|きゃく}さんと{話|はな}すのが{怖|こわ}かったです。',
        'While going to university, I work part-time at a convenience store three times a week. At first I was scared of talking with customers.',
      ],
      [
        '{店長|てんちょう}に「{大|おお}きい{声|こえ}で{話|はな}したほうがいいですよ」と{言|い}われて、{練習|れんしゅう}しました。{今|いま}は{敬語|けいご}も{少|すこ}し{使|つか}えるようになりました。',
        'The manager told me I should speak in a loud voice, so I practised. Now I’ve become able to use a little polite language too.',
      ],
      [
        'アルバイトのお{金|かね}を{貯|た}めて、{夏休|なつやす}みに{海外|かいがい}へ{行|い}くつもりです。',
        'I’m saving the money from the job, and I plan to go abroad in the summer holidays.',
      ],
    ],
    questions: [
      {
        question: 'How often does the writer work?',
        options: ['Every day', 'Once a week', 'Three times a week'],
        answer: 2,
      },
      {
        question: 'What advice did the manager give?',
        options: ['To speak in a loud voice', 'To work more days', 'To smile more'],
        answer: 0,
      },
      { question: 'What is the money for?', options: ['University fees', 'A trip abroad', 'A new phone'], answer: 1 },
    ],
  },
  {
    id: 'lost-wallet',
    level: 4,
    title: 'なくした{財布|さいふ}',
    english: 'The lost wallet',
    paragraphs: [
      [
        '{昨日|きのう}、{買|か}い{物|もの}から{帰|かえ}ったあとで、{財布|さいふ}がないことに{気|き}がつきました。{店|みせ}に{電話|でんわ}しましたが、ありませんでした。',
        'Yesterday, after coming home from shopping, I noticed my wallet was gone. I phoned the shop, but it wasn’t there.',
      ],
      [
        '{次|つぎ}の{日|ひ}、{警察|けいさつ}から{電話|でんわ}がありました。{高校生|こうこうせい}が{駅|えき}で{見|み}つけて、{届|とど}けてくれたそうです。',
        'The next day the police phoned. Apparently a high school student had found it at the station and handed it in.',
      ],
      [
        'お{金|かね}もカードも{全部|ぜんぶ}{入|はい}っていました。お{礼|れい}を{言|い}いたいと{思|おも}いましたが、{名前|なまえ}は{分|わ}かりませんでした。',
        'The money and cards were all there. I wanted to say thank you, but I didn’t know the student’s name.',
      ],
    ],
    questions: [
      {
        question: 'Where was the wallet found?',
        options: ['At the shop', 'At the station', 'At home'],
        answer: 1,
      },
      { question: 'Who phoned the writer?', options: ['The police', 'The shop', 'The student'], answer: 0 },
      {
        question: 'Why couldn’t the writer say thank you?',
        options: ['The student was too busy', 'The police wouldn’t allow it', 'The student’s name wasn’t known'],
        answer: 2,
      },
    ],
  },
  {
    id: 'working-from-home',
    level: 3,
    title: '{家|いえ}で{働|はたら}くということ',
    english: 'Working from home',
    paragraphs: [
      [
        '{最近|さいきん}、{自宅|じたく}で{働|はたら}く{人|ひと}が{増|ふ}えています。{通勤|つうきん}の{時間|じかん}がなくなるので、{家族|かぞく}と{過|す}ごす{時間|じかん}や{趣味|しゅみ}に{使|つか}える{時間|じかん}が{増|ふ}えたという{人|ひと}も{多|おお}いようです。',
        'Lately more people work from home. With no commute, many seem to say they have more time for family and hobbies.',
      ],
      [
        '{一方|いっぽう}で、{同僚|どうりょう}と{直接|ちょくせつ}{話|はな}す{機会|きかい}が{減|へ}ったため、{寂|さび}しいと{感|かん}じる{人|ひと}もいます。{仕事|しごと}と{生活|せいかつ}の{区別|くべつ}がつきにくいという{問題|もんだい}もあります。',
        'On the other hand, some feel lonely because they have fewer chances to talk to colleagues in person. There is also the problem that work and home life are hard to keep apart.',
      ],
      [
        '{会社|かいしゃ}によっては、{週|しゅう}に{数日|すうじつ}だけ{出社|しゅっしゃ}する{働|はたら}き{方|かた}を{選|えら}べるようにしているところもあります。',
        'Some companies let staff choose a way of working in which they come in only a few days a week.',
      ],
    ],
    questions: [
      {
        question: 'Why do people have more free time?',
        options: ['Their working hours were cut', 'They no longer commute', 'They changed jobs'],
        answer: 1,
      },
      {
        question: 'Which problem does the passage mention?',
        options: ['Lower pay', 'Slow internet', 'Fewer chances to talk to colleagues'],
        answer: 2,
      },
      {
        question: 'What do some companies allow?',
        options: ['Coming in only a few days a week', 'Working only at weekends', 'Bringing family to work'],
        answer: 0,
      },
    ],
  },
  {
    id: 'vending-machines',
    level: 3,
    title: '{町|まち}の{自動販売機|じどうはんばいき}',
    english: 'Vending machines in town',
    paragraphs: [
      [
        '{日本|にほん}を{旅行|りょこう}する{外国人|がいこくじん}が{驚|おどろ}くことの{一|ひと}つに、{自動販売機|じどうはんばいき}の{多|おお}さがあります。{飲|の}み{物|もの}だけでなく、{食|た}べ{物|もの}や{傘|かさ}まで{売|う}っているものもあります。',
        'One thing that surprises foreign travellers in Japan is the number of vending machines. Some sell not only drinks but also food and even umbrellas.',
      ],
      [
        '{多|おお}くの{機械|きかい}が{外|そと}に{置|お}かれていても{壊|こわ}されることが{少|すく}ないのは、{治安|ちあん}がいいからだと{言|い}われています。',
        'It is said that the reason they are rarely broken, even though many stand outdoors, is that the country is safe.',
      ],
      [
        'また、{災害|さいがい}の{時|とき}には{無料|むりょう}で{飲|の}み{物|もの}を{出|だ}せる{機械|きかい}もあり、{地域|ちいき}の{役|やく}に{立|た}っています。',
        'There are also machines that can give out drinks for free in a disaster, which are of use to the local area.',
      ],
    ],
    questions: [
      {
        question: 'What surprises foreign travellers?',
        options: ['How many vending machines there are', 'How expensive drinks are', 'How old the machines are'],
        answer: 0,
      },
      {
        question: 'Why are the machines rarely broken?',
        options: ['They are made of strong metal', 'Guards watch them', 'The country is said to be safe'],
        answer: 2,
      },
      {
        question: 'What can some machines do in a disaster?',
        options: ['Send out warnings', 'Give out drinks for free', 'Charge telephones'],
        answer: 1,
      },
    ],
  },
  {
    id: 'speech-contest',
    level: 3,
    title: '{失敗|しっぱい}から{学|まな}んだこと',
    english: 'What I learned from failing',
    paragraphs: [
      [
        '{高校生|こうこうせい}の{時|とき}、スピーチ{大会|たいかい}で{途中|とちゅう}まで{話|はな}して、{内容|ないよう}を{忘|わす}れてしまったことがあります。{恥|は}ずかしくて、もう{人前|ひとまえ}で{話|はな}すのはやめようと{思|おも}いました。',
        'In high school, I once forgot what I was saying partway through a speech contest. I was so embarrassed that I decided never to speak in public again.',
      ],
      [
        'しかし{先生|せんせい}は「{失敗|しっぱい}しない{人|ひと}は{挑戦|ちょうせん}していない{人|ひと}だ」と{言|い}ってくれました。',
        'But my teacher told me that people who don’t fail are people who aren’t trying.',
      ],
      [
        'その{言葉|ことば}のおかげで、{次|つぎ}の{年|とし}も{参加|さんか}することにしました。{結果|けっか}は{三位|さんい}でしたが、{最後|さいご}まで{話|はな}せたことが{何|なに}よりうれしかったです。',
        'Thanks to those words, I decided to take part the next year too. I came third, but being able to speak to the end made me happier than anything.',
      ],
    ],
    questions: [
      {
        question: 'What went wrong at the first contest?',
        options: ['The writer arrived late', 'The writer forgot the speech', 'The writer lost their voice'],
        answer: 1,
      },
      {
        question: 'What was the teacher’s message?',
        options: ['Failing shows you are trying', 'Practise more every day', 'Choose a simpler topic'],
        answer: 0,
      },
      {
        question: 'What made the writer happiest the next year?',
        options: ['Winning first place', 'The teacher’s praise', 'Being able to speak to the end'],
        answer: 2,
      },
    ],
  },
  {
    id: 'empty-houses',
    level: 2,
    title: '{増|ふ}え{続|つづ}ける{空|あ}き{家|や}',
    english: 'The growing number of empty houses',
    paragraphs: [
      [
        '{地方|ちほう}では{人口|じんこう}の{減少|げんしょう}に{伴|ともな}い、{住|す}む{人|ひと}のいない{空|あ}き{家|や}が{増|ふ}え{続|つづ}けている。{放置|ほうち}された{建物|たてもの}は{傷|いた}みが{進|すす}み、{景観|けいかん}や{安全|あんぜん}の{面|めん}でも{問題|もんだい}になりかねない。',
        'In rural areas, as the population falls, the number of empty houses keeps growing. Neglected buildings deteriorate and could become a problem for the look of the area and for safety.',
      ],
      [
        'こうした{状況|じょうきょう}を{受|う}けて、{空|あ}き{家|や}をカフェや{宿泊施設|しゅくはくしせつ}に{改装|かいそう}し、{地域|ちいき}の{活性化|かっせいか}につなげようとする{動|うご}きが{広|ひろ}がっている。',
        'In response, a movement is spreading to convert empty houses into cafes and lodgings and use them to revitalise the area.',
      ],
      [
        'もっとも、{改修|かいしゅう}には{多額|たがく}の{費用|ひよう}がかかるうえ、{利用者|りようしゃ}を{確保|かくほ}し{続|つづ}けるのは{容易|ようい}ではない。{行政|ぎょうせい}の{支援|しえん}と{住民|じゅうみん}の{協力|きょうりょく}が{欠|か}かせないだろう。',
        'However, renovation costs a great deal, and it isn’t easy to keep attracting customers. Government support and residents’ cooperation will surely be essential.',
      ],
    ],
    questions: [
      {
        question: 'Why are empty houses increasing?',
        options: ['New houses are cheaper', 'The rural population is falling', 'Taxes have risen'],
        answer: 1,
      },
      {
        question: 'What are some people doing with them?',
        options: ['Knocking them down', 'Selling them abroad', 'Turning them into cafes and lodgings'],
        answer: 2,
      },
      {
        question: 'What does the writer say is essential?',
        options: ['Support from government and residents', 'More tourists from abroad', 'Lower building costs'],
        answer: 0,
      },
    ],
  },
  {
    id: 'paper-books',
    level: 2,
    title: '{紙|かみ}の{本|ほん}と{電子書籍|でんししょせき}',
    english: 'Paper books and e-books',
    paragraphs: [
      [
        '{電子書籍|でんししょせき}の{普及|ふきゅう}により、{本|ほん}を{持|も}ち{歩|ある}く{必要|ひつよう}はなくなった。{数千冊|すうせんさつ}を{一台|いちだい}の{端末|たんまつ}で{読|よ}めるのだから、{便利|べんり}であることは{間違|まちが}いない。',
        'With the spread of e-books, there is no longer any need to carry books around. Since thousands can be read on one device, they are without doubt convenient.',
      ],
      [
        'にもかかわらず、{紙|かみ}の{本|ほん}を{好|この}む{人|ひと}は{少|すく}なくない。{紙|かみ}の{手触|てざわ}りや、どのあたりまで{読|よ}んだかが{一目|ひとめ}で{分|わ}かる{点|てん}に{魅力|みりょく}を{感|かん}じるのだという。',
        'Even so, quite a few people prefer paper books. They say they are drawn to the feel of the paper and to seeing at a glance how far they have read.',
      ],
      [
        '{結局|けっきょく}のところ、どちらが{優|すぐ}れているかというより、{目的|もくてき}に{応|おう}じて{使|つか}い{分|わ}ければいいのではないだろうか。',
        'In the end, rather than asking which is better, shouldn’t we simply use each according to our purpose?',
      ],
    ],
    questions: [
      {
        question: 'What advantage of e-books is given?',
        options: ['They are always cheaper', 'They are easier on the eyes', 'Thousands fit on one device'],
        answer: 2,
      },
      {
        question: 'What do people like about paper books?',
        options: ['The feel and seeing how far they’ve read', 'That they last longer', 'That they can be resold'],
        answer: 0,
      },
      {
        question: 'What is the writer’s conclusion?',
        options: ['Paper books are better', 'Use each according to your purpose', 'E-books will replace paper'],
        answer: 1,
      },
    ],
  },
  {
    id: 'machine-translation',
    level: 1,
    title: '{機械翻訳|きかいほんやく}の{時代|じだい}に{学|まな}ぶ',
    english: 'Learning in the age of machine translation',
    paragraphs: [
      [
        '{機械翻訳|きかいほんやく}の{精度|せいど}が{飛躍的|ひやくてき}に{向上|こうじょう}した{今日|こんにち}、{外国語|がいこくご}を{学|まな}ぶ{意義|いぎ}を{問|と}う{声|こえ}が{聞|き}かれるようになった。{実務上|じつむじょう}の{文書|ぶんしょ}であれば、{機械|きかい}に{委|ゆだ}ねても{支障|ししょう}のない{場面|ばめん}は{確|たし}かに{増|ふ}えている。',
        'Today, with machine translation vastly more accurate, voices questioning the point of learning foreign languages have come to be heard. For practical documents, there are certainly more situations in which leaving it to a machine causes no difficulty.',
      ],
      [
        'しかし、{言語|げんご}は{単|たん}なる{情報|じょうほう}の{伝達手段|でんたつしゅだん}にとどまらない。{語彙|ごい}や{言|い}い{回|まわ}しの{背後|はいご}には、その{言語|げんご}を{育|はぐく}んできた{文化|ぶんか}や{価値観|かちかん}が{潜|ひそ}んでおり、それらに{触|ふ}れることは{翻訳|ほんやく}を{介|かい}しては{得|え}がたい{経験|けいけん}である。',
        'But language is more than a mere means of conveying information. Behind its vocabulary and turns of phrase lie the culture and values that nurtured it, and encountering them is an experience hard to gain through translation.',
      ],
      [
        '{便利|べんり}な{道具|どうぐ}を{拒|こば}む{必要|ひつよう}はない。{問|と}われているのは、{何|なに}を{機械|きかい}に{任|まか}せ、{何|なに}を{自|みずか}らの{手|て}で{学|まな}ぶのかという{選択|せんたく}であろう。',
        'There is no need to reject a convenient tool. What is being asked of us is surely the choice of what to leave to machines and what to learn with our own hands.',
      ],
    ],
    questions: [
      {
        question: 'Why is the point of learning languages being questioned?',
        options: [
          'Machine translation has become far more accurate',
          'Fewer people travel abroad',
          'Schools have cut classes',
        ],
        answer: 0,
      },
      {
        question: 'What does the writer say translation can’t easily give?',
        options: ['Accurate grammar', 'An encounter with a language’s culture and values', 'Practical documents'],
        answer: 1,
      },
      {
        question: 'What is the writer’s position on machine translation?',
        options: ['It should be avoided', 'It makes study pointless', 'Use it, but choose what to learn yourself'],
        answer: 2,
      },
    ],
  },
];
