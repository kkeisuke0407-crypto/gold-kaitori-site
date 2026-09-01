export type WatchModelStory = {
  slug: string;
  modelName: string;
  shortName: string;
  reference: string;
  searchLabel: string;
  heroImage: string;
  entryImage: string;
  sourceUrl: string;
  sourceLabel: string;
  observedRange: string;
  quotes: [number, number, number, number];
  finalPrice: number;
  conditionDetail: string;
  origin: string;
  unusedReason: string;
  appraisalFocus: string[];
};

export const watchModelStories: WatchModelStory[] = [
  {
    slug: 'submariner',
    modelName: 'サブマリーナ',
    shortName: 'サブマリーナ',
    reference: '14060M',
    searchLabel: 'サブマリーナの買取価格・買取相場',
    heroImage: '/hikakaku-watch-story/models/submariner/hero-v1.webp',
    entryImage: '/hikakaku-watch-story/models/submariner/entry-form-v1.webp',
    sourceUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/submariner-men/assessment_achievements/',
    sourceLabel: 'ヒカカク！「サブマリーナの査定実績・事例」',
    observedRange: '同一型番・中古品（使用感あり）の公開査定例 1,200,000〜1,400,000円',
    quotes: [1200000, 1280000, 1350000, 1400000],
    finalPrice: 1360000,
    conditionDetail: 'ベルトに細かい傷あり',
    origin: '仕事の節目に買い、休日にもよく使っていた一本',
    unusedReason: '最近はスマートウォッチを使うことが増え、出番が減っていました',
    appraisalFocus: ['ノンデイトの型番確認', 'ベゼル・ブレスレットの傷', '箱・保証書・余りコマ', '動作と整備履歴'],
  },
  {
    slug: 'datejust',
    modelName: 'デイトジャスト',
    shortName: 'デイトジャスト',
    reference: '116234 ホワイト ローマ',
    searchLabel: 'デイトジャストの買取価格・買取相場',
    heroImage: '/hikakaku-watch-story/models/datejust/hero-v1.webp',
    entryImage: '/hikakaku-watch-story/models/datejust/entry-form-v1.webp',
    sourceUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/datejust-mens/assessment_achievements/',
    sourceLabel: 'ヒカカク！「デイトジャストの査定実績・事例」',
    observedRange: '同一型番・中古美品の公開査定例 950,000〜1,000,000円を確認',
    quotes: [850000, 900000, 960000, 1000000],
    finalPrice: 970000,
    conditionDetail: 'ベゼルとベルトに細かい傷あり',
    origin: '就職した頃に買い、仕事の日によく着けていた一本',
    unusedReason: '服装が変わってから着ける機会が少なくなっていました',
    appraisalFocus: ['文字盤・インデックスの仕様', 'フルーテッドベゼルの状態', 'ブレスレットの伸び・傷', '箱・保証書の有無'],
  },
  {
    slug: 'daytona',
    modelName: 'デイトナ',
    shortName: 'デイトナ',
    reference: '116500LN ブラック',
    searchLabel: 'デイトナの買取価格・買取相場',
    heroImage: '/hikakaku-watch-story/models/daytona/hero-v1.webp',
    entryImage: '/hikakaku-watch-story/models/daytona/entry-form-v1.webp',
    sourceUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/daytona-men/assessment_achievements/',
    sourceLabel: 'ヒカカク！「デイトナの査定実績・事例」',
    observedRange: '同一型番・中古品（使用感あり）の公開査定例 3,700,000〜5,150,000円',
    quotes: [3700000, 4050000, 4500000, 5150000],
    finalPrice: 5020000,
    conditionDetail: 'ベゼルとケースに細かい傷あり',
    origin: '何年も探して手に入れ、特別な日に着けていた一本',
    unusedReason: '傷を増やしたくない気持ちもあり、しまったままの時間が長くなっていました',
    appraisalFocus: ['文字盤色と正確な型番', 'セラミックベゼルの状態', 'クロノグラフの動作', '保証書・付属品の年代'],
  },
  {
    slug: 'gmt-master-ii',
    modelName: 'GMTマスター II',
    shortName: 'GMTマスターII',
    reference: '116710LN',
    searchLabel: 'GMTマスターIIの買取価格・買取相場',
    heroImage: '/hikakaku-watch-story/models/gmt-master-ii/hero-v1.webp',
    entryImage: '/hikakaku-watch-story/models/gmt-master-ii/entry-form-v1.webp',
    sourceUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master-ii-men/assessment_achievements/',
    sourceLabel: 'ヒカカク！「GMTマスター IIの査定実績・事例」',
    observedRange: '同一型番・中古品（使用感あり）の公開査定例 1,600,000〜2,100,000円',
    quotes: [1600000, 1780000, 1950000, 2100000],
    finalPrice: 2020000,
    conditionDetail: 'ベルトに細かい傷あり',
    origin: '出張が多かった頃に買い、旅先でも使っていた一本',
    unusedReason: '海外へ行く機会が減り、時計ケースに入れたままになっていました',
    appraisalFocus: ['型番とベゼル仕様', 'GMT針・日付の動作', 'ケース・ブレスレットの傷', '保証書・余りコマ'],
  },
  {
    slug: 'explorer',
    modelName: 'エクスプローラー I',
    shortName: 'エクスプローラーI',
    reference: '214270',
    searchLabel: 'エクスプローラーIの買取価格・買取相場',
    heroImage: '/hikakaku-watch-story/models/explorer/hero-v1.webp',
    entryImage: '/hikakaku-watch-story/models/explorer/entry-form-v1.webp',
    sourceUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/explorer-i-men/assessment_achievements/',
    sourceLabel: 'ヒカカク！「エクスプローラー Iの査定実績・事例」',
    observedRange: '同一型番・中古美品の公開査定例 950,000〜1,200,000円を確認',
    quotes: [950000, 1020000, 1120000, 1200000],
    finalPrice: 1160000,
    conditionDetail: 'ケースとベルトに細かい傷あり',
    origin: '派手すぎないデザインが気に入り、日常使いしていた一本',
    unusedReason: '仕事でもスマートウォッチを使うようになり、着ける日が減っていました',
    appraisalFocus: ['新旧文字盤と型番', 'ケース・ブレスレットの傷', '夜光・針の状態', '保証書・製造時期'],
  },
];

export const watchModelStoryBySlug = Object.fromEntries(
  watchModelStories.map((story) => [story.slug, story]),
) as Record<string, WatchModelStory>;

