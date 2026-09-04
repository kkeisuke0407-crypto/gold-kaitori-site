export type AppraisalEvidence = {
  date: string;
  condition: string;
  dealer: string;
  price: number;
  note?: string;
};

export type WatchModelStory = {
  slug: string;
  assetVersion?: string;
  modelName: string;
  shortName: string;
  reference: string;
  searchLabel: string;
  heroImage: string;
  heroAlt: string;
  officialUrl: string;
  sourceCheckedAt: string;
  decision: 'GO-A' | 'GO-B';
  evidenceNote: string;
  appraisals: AppraisalEvidence[];
  appraisalFocus: string[];
  modelCase: {
    amountA: number;
    amountB: number;
    amountC: number;
    amountD: number;
    amountFinal: number;
  };
};

type RawStory = Omit<WatchModelStory, 'searchLabel' | 'heroImage' | 'heroAlt' | 'sourceCheckedAt'>;
const build = (story: RawStory): WatchModelStory => ({
  ...story,
  searchLabel: `${story.modelName} ${story.reference}の買取価格・買取相場`,
  heroImage: `/hikakaku-watch-story/models/${story.slug}/hero-20260902.webp`,
  heroAlt: `木目の上に置かれた${story.modelName} ${story.reference}をイメージした腕時計`,
  sourceCheckedAt: '2026-09-02',
});
const e = (date: string, condition: string, dealer: string, price: number, note?: string): AppraisalEvidence =>
  ({ date, condition, dealer, price, ...(note ? { note } : {}) });

export const watchModelStories: WatchModelStory[] = [
  build({
    slug: 'rolex-submariner-16610', modelName: 'サブマリーナ デイト', shortName: 'サブマリーナ', reference: '16610',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/127258/', decision: 'GO-A',
    evidenceNote: '2026年2〜3月に掲載された、同型番・同程度の状態の別々の査定実績です。',
    appraisals: [e('2026-02-16','中古品・使用感あり','エステメ',1330000),e('2026-02-17','中古品・使用感あり','買虎',1450000),e('2026-03-12','中古品・使用感あり','買虎',1500000)],
    appraisalFocus: ['型番と製造年代','ベゼル・ブレスレットの状態','動作と整備履歴','箱・保証書・余りコマ'],
    modelCase: { amountA: 1200000, amountB: 1309000, amountC: 1438900, amountD: 1500000, amountFinal: 1438900 },
  }),
  build({
    slug: 'rolex-datejust-16233', modelName: 'デイトジャスト', shortName: 'デイトジャスト', reference: '16233',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/676274/', decision: 'GO-B',
    evidenceNote: '確認できた信頼性の高い過去の掲載例です。古い事例のため、現在相場や複数業者の比較を示すものではありません。',
    appraisals: [e('2021-10-27','故障品','買取屋アップ',450000,'状態差の参考'),e('2024-02-12','中古美品','買取屋アップ',650000,'過去の掲載例')],
    appraisalFocus: ['文字盤・インデックスの仕様','コンビ素材の状態','ブレスレットの伸び','箱・保証書の有無'],
    modelCase: { amountA: 650000, amountB: 793100, amountC: 827000, amountD: 970000, amountFinal: 827000 },
  }),
  build({
    slug: 'rolex-air-king-14000', modelName: 'エアキング', shortName: 'エアキング', reference: '14000',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2847292/', decision: 'GO-A',
    evidenceNote: '2025年4月〜2026年8月に掲載された中古美品の別々の査定実績です。',
    appraisals: [e('2025-04-22','中古美品','エステメ',600000),e('2025-04-23','中古美品','買虎',680000),e('2026-08-08','中古美品','エステメ',780000)],
    appraisalFocus: ['文字盤と正確な型番','ケース・ブレスレットの傷','動作と整備履歴','箱・保証書の有無'],
    modelCase: { amountA: 550000, amountB: 600000, amountC: 606300, amountD: 680000, amountFinal: 600000 },
  }),
  build({
    slug: 'rolex-submariner-14060', modelName: 'サブマリーナ', shortName: 'サブマリーナ', reference: '14060',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3408826/', decision: 'GO-A',
    evidenceNote: '2024年5月の近い日付に掲載された、同型番・同状態の別々の査定実績です。',
    appraisals: [e('2024-05-31','中古品・使用感あり','買虎',1200000),e('2024-05-28','中古品・使用感あり','エステメ',1270000)],
    appraisalFocus: ['ノンデイトの型番確認','ベゼル・ブレスレットの傷','動作と整備履歴','箱・保証書・余りコマ'],
    modelCase: { amountA: 1050000, amountB: 1166900, amountC: 1200000, amountD: 1300000, amountFinal: 1166900 },
  }),
  build({
    slug: 'rolex-explorer-ii-16570', assetVersion: 'v3', modelName: 'エクスプローラーII ブラック', shortName: 'エクスプローラーII', reference: '16570',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2657132/', decision: 'GO-A',
    evidenceNote: '2026年6〜8月に公開されたブラック文字盤・通常使用個体の実績と参考相場を照合したモデルケースです。',
    appraisals: [e('2026-06','ブラック文字盤・Bランク','なんぼや',900000),e('2026-06','ブラック文字盤・Bランク','なんぼや',955000),e('2026-06','ブラック文字盤・Bランク','なんぼや',1050000)],
    appraisalFocus: ['ブラック文字盤と型番','24時間ベゼルとGMT針','ケース・ブレスレットの傷','保証書・製造時期'],
    modelCase: { amountA: 900000, amountB: 955000, amountC: 1050000, amountD: 1100000, amountFinal: 1050000 },
  }),
  build({
    slug: 'rolex-daytona-16520', modelName: 'デイトナ ブラック', shortName: 'デイトナ', reference: '16520',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/288712/', decision: 'GO-A',
    evidenceNote: '2026年のブラック文字盤・通常使用個体の公開実績と参考相場を照合したモデルケースです。',
    appraisals: [e('2026-01','ブラック文字盤・Bランク','ブラリバ',3659500),e('2026-05','ブラック文字盤・Bランク','ブラリバ',4282700)],
    appraisalFocus: ['ブラック文字盤とシリアル','タキメーターベゼル','クロノグラフの動作','保証書・付属品の年代'],
    modelCase: { amountA: 3550000, amountB: 3700000, amountC: 3820000, amountD: 4280000, amountFinal: 4100000 },
  }),
  build({
    slug: 'rolex-daytona-116520', modelName: 'デイトナ ブラック', shortName: 'デイトナ', reference: '116520',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/125921/', decision: 'GO-A',
    evidenceNote: 'ブラック文字盤について掲載された別々の査定実績です。掲載時期と状態も併記しています。',
    appraisals: [e('2024-12-05','目立つ傷がある','買取天国ティキソルtikisol',2000000,'状態差の参考'),e('2024-07-25','中古美品','買虎',3300000),e('2026-03-06','中古美品','アサカの買取',3750000)],
    appraisalFocus: ['ブラック文字盤と型番','スチールベゼルの状態','クロノグラフの動作','保証書・付属品'],
    modelCase: { amountA: 3217700, amountB: 3297000, amountC: 3365000, amountD: 3610000, amountFinal: 3365000 },
  }),
  build({
    slug: 'rolex-gmt-master-16700', assetVersion: 'v3', modelName: 'GMTマスター ブラック', shortName: 'GMTマスター', reference: '16700',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master/assessment_achievements/', decision: 'GO-A',
    evidenceNote: 'ブラックベゼル・通常使用個体として、希少仕様やベゼル違いを混ぜずに再構成したモデルケースです。',
    appraisals: [e('2026-07','ブラック文字盤・通常使用個体','カメラのキタムラ',1228873),e('2026-07','ブラック仕様・通常使用個体','コミット銀座',1800000)],
    appraisalFocus: ['ブラックベゼルとシリアル','GMT針・日付の動作','ケース・ブレスレットの傷','保証書・余りコマ'],
    modelCase: { amountA: 1300000, amountB: 1500000, amountC: 1650000, amountD: 1800000, amountFinal: 1650000 },
  }),
  build({
    slug: 'rolex-daytona-116500ln', modelName: 'デイトナ ブラック', shortName: 'デイトナ', reference: '116500LN',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/1034255/', decision: 'GO-A',
    evidenceNote: '2026年4月に掲載されたブラック文字盤・中古美品の別々の査定実績です。明らかな桁違いの掲載値は使用していません。',
    appraisals: [e('2026-04-15','中古美品','買取天国ティキソルtikisol',3500000),e('2026-04-16','中古美品','買虎',4100000)],
    appraisalFocus: ['ブラック文字盤と型番','セラミックベゼルの状態','クロノグラフの動作','保証書・付属品の年代'],
    modelCase: { amountA: 4050000, amountB: 4180000, amountC: 4260000, amountD: 4380000, amountFinal: 4280000 },
  }),
  build({
    slug: 'rolex-datejust-16234', modelName: 'デイトジャスト ブラック', shortName: 'デイトジャスト', reference: '16234',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2846863/', decision: 'GO-A',
    evidenceNote: '2026年のブラック文字盤・Bランク実績と参考相場を照合したモデルケースです。',
    appraisals: [e('2026','ブラック文字盤・Bランク','なんぼや',940000),e('2026','ブラック文字盤・Bランク','ブラリバ',1031000)],
    appraisalFocus: ['ブラック文字盤と型番','フルーテッドベゼル','ブレスレットの伸び・傷','箱・保証書の有無'],
    modelCase: { amountA: 900000, amountB: 940000, amountC: 990000, amountD: 1030000, amountFinal: 980000 },
  }),
  build({
    slug: 'rolex-datejust-16013', modelName: 'デイトジャスト', shortName: 'デイトジャスト', reference: '16013',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/288862/', decision: 'GO-A',
    evidenceNote: '掲載時期の異なる別々の査定実績です。差額は当時の掲載例の幅として確認してください。',
    appraisals: [e('2024-01-28','中古品・使用感あり','エステメ大阪支店',640000),e('2025-07-04','中古美品','エステメ',750000),e('2026-02-12','中古品・使用感あり','エステメ 福岡天神店',950000)],
    appraisalFocus: ['文字盤とシリアル','コンビ素材の状態','ブレスレットの伸び','箱・保証書の有無'],
    modelCase: { amountA: 500000, amountB: 600000, amountC: 677000, amountD: 750000, amountFinal: 677000 },
  }),
  build({
    slug: 'rolex-date-15200', modelName: 'オイスターパーペチュアル デイト N番', shortName: 'オイスターパーペチュアル デイト', reference: '15200',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3536029/', decision: 'GO-B',
    evidenceNote: '確認できた2件は2022年に同一業者が掲載した過去事例です。現在相場や業者間の価格差を示すものではありません。',
    appraisals: [e('2022-01-14','中古美品','エステメ',470000,'過去の掲載例'),e('2022-05-11','中古品・使用感あり','エステメ',450000,'過去の掲載例')],
    appraisalFocus: ['N番と正確な型番','文字盤・ケースの状態','ブレスレットの伸び','箱・保証書の有無'],
    modelCase: { amountA: 450000, amountB: 550000, amountC: 650000, amountD: 670000, amountFinal: 650000 },
  }),
  build({
    slug: 'rolex-submariner-116610ln', modelName: 'サブマリーナ', shortName: 'サブマリーナ', reference: '116610LN',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2847312/', decision: 'GO-A',
    evidenceNote: '2024年12月〜2025年2月に掲載された別々の査定実績です。同一個体の同時比較ではありません。',
    appraisals: [e('2024-12-22','中古美品','エステメ',1900000),e('2025-02-13','中古品・使用感あり','エステメ 福岡天神店',1950000),e('2025-01-16','中古美品','エステメ大阪支店',2080000)],
    appraisalFocus: ['型番とセラミックベゼル','ケース・ブレスレットの傷','動作と整備履歴','箱・保証書・余りコマ'],
    modelCase: { amountA: 1630000, amountB: 1688100, amountC: 1744800, amountD: 1780000, amountFinal: 1744800 },
  }),
  build({
    slug: 'rolex-submariner-124060', modelName: 'サブマリーナ', shortName: 'サブマリーナ', reference: '124060',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3785900/', decision: 'GO-A',
    evidenceNote: '2025年8〜11月に掲載された中古美品の別々の査定実績です。明らかな桁違いの掲載値は使用していません。',
    appraisals: [e('2025-08-13','中古美品','エステメ 神戸三宮店',1680000),e('2025-11-06','中古美品','エステメ 福岡天神店',1750000),e('2025-10-19','中古美品','エステメ 福岡天神店',1780000)],
    appraisalFocus: ['ノンデイトと41mm仕様','セラミックベゼル','ケース・ブレスレットの傷','箱・保証書・余りコマ'],
    modelCase: { amountA: 1750000, amountB: 1850000, amountC: 2000000, amountD: 2070000, amountFinal: 1850000 },
  }),
  build({
    slug: 'rolex-gmt-master-ii-16710', assetVersion: 'v3', modelName: 'GMTマスターII ブラック', shortName: 'GMTマスターII', reference: '16710',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master-ii-men/assessment_achievements/', decision: 'GO-A',
    evidenceNote: 'ブラック仕様・通常使用個体として、赤青・赤黒ベゼルなどの条件差を混ぜずに再構成したモデルケースです。',
    appraisals: [e('2026-08','ブラック仕様','ブラリバ',1744800),e('2026-08','ブラック仕様','ブラリバ',1880700),e('2026-08','ブラック仕様','ブラリバ',1960000)],
    appraisalFocus: ['ブラックベゼルとシリアル','GMT針・日付の動作','ケース・ブレスレットの傷','保証書・余りコマ'],
    modelCase: { amountA: 1620000, amountB: 1740000, amountC: 1880000, amountD: 1960000, amountFinal: 1880000 },
  }),
  build({
    slug: 'rolex-submariner-126610ln', modelName: 'サブマリーナ デイト', shortName: 'サブマリーナ', reference: '126610LN',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3785901/', decision: 'GO-A',
    evidenceNote: '2026年8月の参考相場と中古Bランク実績を照合した、通常使用個体のモデルケースです。',
    appraisals: [e('2026-08','中古Bランク','なんぼや',1990000),e('2026-08','中古Bランク','なんぼや',2030000),e('2026-08','通常使用個体','大黒屋',2300000)],
    appraisalFocus: ['型番と41mm仕様','セラミックベゼル','ケース・ブレスレットの傷','箱・保証書・余りコマ'],
    modelCase: { amountA: 1990000, amountB: 2050000, amountC: 2180000, amountD: 2300000, amountFinal: 2180000 },
  }),
];

export const watchModelStoryBySlug = Object.fromEntries(
  watchModelStories.map((story) => [story.slug, story]),
) as Record<string, WatchModelStory>;
