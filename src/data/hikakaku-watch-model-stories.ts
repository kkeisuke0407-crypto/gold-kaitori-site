export type AppraisalEvidence = {
  date: string;
  condition: string;
  dealer: string;
  price: number;
  note?: string;
};

export type WatchModelStory = {
  slug: string;
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
    sourceLinks: { label: string; url: string }[];
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
    modelCase: { amountA: 1200000, amountB: 1309000, amountC: 1438900, amountD: 1500000, amountFinal: 1438900, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/127258/' },
      { label: 'ブラリバ買取実績', url: 'https://brandrevalue.com/cat/watch/purchase-watch/rolex/submariner/16610' },
      { label: 'なんぼや買取実績', url: 'https://nanboya.com/tokei-kaitori/rolex/submarina/' },
      { label: 'コミット銀座参考価格', url: 'https://commit-watch.co.jp/blogs/kaitori/kb16610' },
    ] },
  }),
  build({
    slug: 'rolex-datejust-16233', modelName: 'デイトジャスト', shortName: 'デイトジャスト', reference: '16233',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/676274/', decision: 'GO-B',
    evidenceNote: '確認できた信頼性の高い過去の掲載例です。古い事例のため、現在相場や複数業者の比較を示すものではありません。',
    appraisals: [e('2021-10-27','故障品','買取屋アップ',450000,'状態差の参考'),e('2024-02-12','中古美品','買取屋アップ',650000,'過去の掲載例')],
    appraisalFocus: ['文字盤・インデックスの仕様','コンビ素材の状態','ブレスレットの伸び','箱・保証書の有無'],
    modelCase: { amountA: 650000, amountB: 793100, amountC: 827000, amountD: 970000, amountFinal: 827000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/676274/' },
      { label: 'ブラリバ買取実績', url: 'https://brandrevalue.com/cat/watch/purchase-watch/rolex/datejust/16233' },
      { label: 'コメ兵買取実績', url: 'https://komehyo.jp/kaitori/item/br-140806/pn-7871/' },
    ] },
  }),
  build({
    slug: 'rolex-air-king-14000', modelName: 'エアキング', shortName: 'エアキング', reference: '14000',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2847292/', decision: 'GO-A',
    evidenceNote: '2025年4月〜2026年8月に掲載された中古美品の別々の査定実績です。',
    appraisals: [e('2025-04-22','中古美品','エステメ',600000),e('2025-04-23','中古美品','買虎',680000),e('2026-08-08','中古美品','エステメ',780000)],
    appraisalFocus: ['文字盤と正確な型番','ケース・ブレスレットの傷','動作と整備履歴','箱・保証書の有無'],
    modelCase: { amountA: 550000, amountB: 600000, amountC: 606300, amountD: 680000, amountFinal: 600000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/2847292/' },
      { label: '大黒屋参考価格', url: 'https://kaitori.e-daikoku.com/brand/brand/rolex_airking.html' },
      { label: 'ロデオドライブ参考価格', url: 'https://kaitori.rodeodrive.co.jp/brand/rolex/airking/' },
    ] },
  }),
  build({
    slug: 'rolex-submariner-14060', modelName: 'サブマリーナ', shortName: 'サブマリーナ', reference: '14060',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3408826/', decision: 'GO-A',
    evidenceNote: '2024年5月の近い日付に掲載された、同型番・同状態の別々の査定実績です。',
    appraisals: [e('2024-05-31','中古品・使用感あり','買虎',1200000),e('2024-05-28','中古品・使用感あり','エステメ',1270000)],
    appraisalFocus: ['ノンデイトの型番確認','ベゼル・ブレスレットの傷','動作と整備履歴','箱・保証書・余りコマ'],
    modelCase: { amountA: 1050000, amountB: 1166900, amountC: 1200000, amountD: 1300000, amountFinal: 1166900, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/3408826/' },
      { label: 'ブラリバ買取実績', url: 'https://brandrevalue.com/cat/watch/purchase-watch/rolex/submariner/14060' },
      { label: 'ネットオフ相場集計', url: 'https://www.netoff.co.jp/kaitori-navi/watch-souba/rolex/submariner/14060/' },
    ] },
  }),
  build({
    slug: 'rolex-explorer-ii-16570', modelName: 'エクスプローラーII ホワイト', shortName: 'エクスプローラーII', reference: '16570',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2657132/', decision: 'GO-A',
    evidenceNote: 'ホワイト文字盤について掲載された別々の査定実績です。文字盤違いの価格を示すものではありません。',
    appraisals: [e('2025-01-28','中古美品','買取屋アップ',850000),e('2025-02-08','中古美品','エステメ大阪支店',1100000)],
    appraisalFocus: ['ホワイト文字盤と型番','24時間ベゼルとGMT針','ケース・ブレスレットの傷','保証書・製造時期'],
    modelCase: { amountA: 1072728, amountB: 1100000, amountC: 1200000, amountD: 1270000, amountFinal: 1200000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/2657132/' },
      { label: 'カメラのキタムラ買取実績', url: 'https://ns-prod.kitamura.shop/watch/sell/brand/%E3%83%AD%E3%83%AC%E3%83%83%E3%82%AF%E3%82%B9%28rolex%29/%E3%82%A8%E3%82%AF%E3%82%B9%E3%83%97%E3%83%AD%E3%83%BC%E3%83%A9%E3%83%BCii/ref/16570/' },
      { label: 'プレミアバリュー参考価格', url: 'https://premiervalue.jp/rolex/explorer2/ref_16570/product_202608_16570/' },
      { label: 'コミット銀座参考価格', url: 'https://commit-watch.co.jp/blogs/kaitori/kb16570w' },
    ] },
  }),
  build({
    slug: 'rolex-daytona-16520', modelName: 'デイトナ', shortName: 'デイトナ', reference: '16520',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/288712/', decision: 'GO-A',
    evidenceNote: '2025年5〜6月に掲載された、同型番・同状態の別々の査定実績です。',
    appraisals: [e('2025-06-12','中古品・使用感あり','エステメ大阪支店',2850000),e('2025-06-12','中古品・使用感あり','シグマ',3000000),e('2025-05-18','中古品・使用感あり','エステメ',3600000)],
    appraisalFocus: ['文字盤とシリアル','タキメーターベゼル','クロノグラフの動作','保証書・付属品の年代'],
    modelCase: { amountA: 2700000, amountB: 3105000, amountC: 3800000, amountD: 4282700, amountFinal: 3800000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/288712/' },
      { label: 'なんぼや相場・買取実績', url: 'https://nanboya.com/tokei-kaitori/price-list/rolex/daytona/ref-16520/' },
      { label: 'ブラリバ相場・買取実績', url: 'https://brandrevalue.com/cat/watch/rolex/rolex-daytona/16520' },
    ] },
  }),
  build({
    slug: 'rolex-daytona-116520', modelName: 'デイトナ ブラック', shortName: 'デイトナ', reference: '116520',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/125921/', decision: 'GO-A',
    evidenceNote: 'ブラック文字盤について掲載された別々の査定実績です。掲載時期と状態も併記しています。',
    appraisals: [e('2024-12-05','目立つ傷がある','買取天国ティキソルtikisol',2000000,'状態差の参考'),e('2024-07-25','中古美品','買虎',3300000),e('2026-03-06','中古美品','アサカの買取',3750000)],
    appraisalFocus: ['ブラック文字盤と型番','スチールベゼルの状態','クロノグラフの動作','保証書・付属品'],
    modelCase: { amountA: 3217700, amountB: 3297000, amountC: 3365000, amountD: 3610000, amountFinal: 3365000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/125921/' },
      { label: 'ブラリバ相場・買取実績', url: 'https://brandrevalue.com/cat/watch/rolex/rolex-daytona/116520' },
      { label: 'ブラリバ実績一覧', url: 'https://brandrevalue.com/cat/watch/purchase-watch/rolex/daytona/116520' },
    ] },
  }),
  build({
    slug: 'rolex-gmt-master-16700', modelName: 'GMTマスター', shortName: 'GMTマスター', reference: '16700',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master/assessment_achievements/', decision: 'GO-A',
    evidenceNote: 'ベゼル色やシリアルの記載がある、別々の公式掲載実績です。仕様差も含めて確認してください。',
    appraisals: [e('2025-10-13','中古美品','エステメ',1650000),e('2025-11-09','中古美品・N番・赤青ベゼル','銀座パリス 梅田店',1700000),e('2025-11-13','中古美品・N番・赤青ベゼル','買虎',1800000)],
    appraisalFocus: ['シリアルとベゼル色','GMT針・日付の動作','ケース・ブレスレットの傷','保証書・余りコマ'],
    modelCase: { amountA: 1228873, amountB: 1650000, amountC: 1800000, amountD: 1950000, amountFinal: 1800000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master/assessment_achievements/' },
      { label: 'カメラのキタムラ買取実績', url: 'https://ns-prod.kitamura.shop/watch/sell/item/0000900929/price/' },
      { label: 'コミット銀座参考価格', url: 'https://commit-watch.co.jp/blogs/kaitori/kb16700-b' },
    ] },
  }),
  build({
    slug: 'rolex-daytona-116500ln', modelName: 'デイトナ ブラック', shortName: 'デイトナ', reference: '116500LN',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/1034255/', decision: 'GO-A',
    evidenceNote: '2026年4月に掲載されたブラック文字盤・中古美品の別々の査定実績です。明らかな桁違いの掲載値は使用していません。',
    appraisals: [e('2026-04-15','中古美品','買取天国ティキソルtikisol',3500000),e('2026-04-16','中古美品','買虎',4100000)],
    appraisalFocus: ['ブラック文字盤と型番','セラミックベゼルの状態','クロノグラフの動作','保証書・付属品の年代'],
    modelCase: { amountA: 4050000, amountB: 4180000, amountC: 4260000, amountD: 4380000, amountFinal: 4280000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/1034255/' },
      { label: 'なんぼや相場', url: 'https://nanboya.com/tokei-kaitori/price-list/rolex/daytona/ref-116500ln/' },
      { label: 'ブラリバ買取実績', url: 'https://brandrevalue.com/cat/watch/purchase-watch/rolex/daytona' },
    ] },
  }),
  build({
    slug: 'rolex-datejust-16234', modelName: 'デイトジャスト ブラック', shortName: 'デイトジャスト', reference: '16234',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2846863/', decision: 'GO-A',
    evidenceNote: '同日に掲載された例を含みますが、同一個体の同時査定とは確認できないため、別々の公式掲載実績として示しています。',
    appraisals: [e('2025-12-10','中古品・使用感あり','Watch7',700000),e('2025-12-10','中古品・使用感あり','買虎',1000000),e('2025-09-30','中古品・使用感あり','買虎',1010000)],
    appraisalFocus: ['ブラック文字盤と型番','フルーテッドベゼル','ブレスレットの伸び・傷','箱・保証書の有無'],
    modelCase: { amountA: 700000, amountB: 837000, amountC: 1000000, amountD: 1031000, amountFinal: 1000000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/2846863/' },
      { label: 'なんぼや相場・買取実績', url: 'https://nanboya.com/tokei-kaitori/price-list/rolex/datejust/ref-16234/' },
      { label: 'ブラリバ買取実績', url: 'https://brandrevalue.com/cat/watch/rolex/rolex-datejust/16234' },
    ] },
  }),
  build({
    slug: 'rolex-datejust-16013', modelName: 'デイトジャスト', shortName: 'デイトジャスト', reference: '16013',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/288862/', decision: 'GO-A',
    evidenceNote: '掲載時期の異なる別々の査定実績です。差額は当時の掲載例の幅として確認してください。',
    appraisals: [e('2024-01-28','中古品・使用感あり','エステメ大阪支店',640000),e('2025-07-04','中古美品','エステメ',750000),e('2026-02-12','中古品・使用感あり','エステメ 福岡天神店',950000)],
    appraisalFocus: ['文字盤とシリアル','コンビ素材の状態','ブレスレットの伸び','箱・保証書の有無'],
    modelCase: { amountA: 500000, amountB: 600000, amountC: 677000, amountD: 750000, amountFinal: 677000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/288862/' },
      { label: 'なんぼや相場', url: 'https://nanboya.com/tokei-kaitori/price-list/rolex/datejust/ref-16013/' },
      { label: 'ピアゾ相場', url: 'https://piazo.jp/rolex/datejust/ref16013G/' },
      { label: 'キングラム買取実績', url: 'https://kingram.jp/jisseki/brand-cat/rolex-standard/' },
    ] },
  }),
  build({
    slug: 'rolex-date-15200', modelName: 'オイスターパーペチュアル デイト N番', shortName: 'オイスターパーペチュアル デイト', reference: '15200',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3536029/', decision: 'GO-B',
    evidenceNote: '確認できた2件は2022年に同一業者が掲載した過去事例です。現在相場や業者間の価格差を示すものではありません。',
    appraisals: [e('2022-01-14','中古美品','エステメ',470000,'過去の掲載例'),e('2022-05-11','中古品・使用感あり','エステメ',450000,'過去の掲載例')],
    appraisalFocus: ['N番と正確な型番','文字盤・ケースの状態','ブレスレットの伸び','箱・保証書の有無'],
    modelCase: { amountA: 450000, amountB: 550000, amountC: 650000, amountD: 670000, amountFinal: 650000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/3536029/' },
      { label: 'クォーク参考価格', url: 'https://www.909.co.jp/rolex_buy/opd.html' },
      { label: 'キングラム買取実績', url: 'https://kingram.jp/jisseki/brand-cat/rolex-standard/' },
      { label: 'コメ兵買取実績', url: 'https://komehyo.jp/kaitori/item/br-140806/pn-7579/' },
    ] },
  }),
  build({
    slug: 'rolex-submariner-116610ln', modelName: 'サブマリーナ', shortName: 'サブマリーナ', reference: '116610LN',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/2847312/', decision: 'GO-A',
    evidenceNote: '2024年12月〜2025年2月に掲載された別々の査定実績です。同一個体の同時比較ではありません。',
    appraisals: [e('2024-12-22','中古美品','エステメ',1900000),e('2025-02-13','中古品・使用感あり','エステメ 福岡天神店',1950000),e('2025-01-16','中古美品','エステメ大阪支店',2080000)],
    appraisalFocus: ['型番とセラミックベゼル','ケース・ブレスレットの傷','動作と整備履歴','箱・保証書・余りコマ'],
    modelCase: { amountA: 1630000, amountB: 1688100, amountC: 1744800, amountD: 1780000, amountFinal: 1744800, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/2847312/' },
      { label: 'なんぼや相場・買取実績', url: 'https://nanboya.com/tokei-kaitori/price-list/rolex/submarina/ref-116610LN/' },
      { label: 'ブラリバ相場・買取実績', url: 'https://brandrevalue.com/cat/watch/rolex/rolex-submariner/116610ln' },
    ] },
  }),
  build({
    slug: 'rolex-submariner-124060', modelName: 'サブマリーナ', shortName: 'サブマリーナ', reference: '124060',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3785900/', decision: 'GO-A',
    evidenceNote: '2025年8〜11月に掲載された中古美品の別々の査定実績です。明らかな桁違いの掲載値は使用していません。',
    appraisals: [e('2025-08-13','中古美品','エステメ 神戸三宮店',1680000),e('2025-11-06','中古美品','エステメ 福岡天神店',1750000),e('2025-10-19','中古美品','エステメ 福岡天神店',1780000)],
    appraisalFocus: ['ノンデイトと41mm仕様','セラミックベゼル','ケース・ブレスレットの傷','箱・保証書・余りコマ'],
    modelCase: { amountA: 1750000, amountB: 1850000, amountC: 2000000, amountD: 2070000, amountFinal: 1850000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/3785900/' },
      { label: 'ブラリバ参考価格', url: 'https://brandrevalue.com/cat/watch/rolex/rolex-submariner/124060' },
      { label: '大黒屋参考価格', url: 'https://kaitori.e-daikoku.com/rolex/shop/kokubunji/' },
    ] },
  }),
  build({
    slug: 'rolex-gmt-master-ii-16710', modelName: 'GMTマスターII', shortName: 'GMTマスターII', reference: '16710',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master-ii-men/assessment_achievements/', decision: 'GO-A',
    evidenceNote: 'シリアルやベゼル仕様の異なる例を含む、別々の公式掲載実績です。各条件を併記しています。',
    appraisals: [e('2026-06-29','中古美品','エステメ',1800000),e('2026-06-28','中古美品','戸越銀座屋',1850000),e('2025-12-26','中古美品・A番','買虎',2050000,'シリアル差あり')],
    appraisalFocus: ['シリアルとベゼル色','GMT針・日付の動作','ケース・ブレスレットの傷','保証書・余りコマ'],
    modelCase: { amountA: 1385000, amountB: 1549000, amountC: 1658000, amountD: 1949000, amountFinal: 1658000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master-ii-men/assessment_achievements/' },
      { label: 'なんぼや相場', url: 'https://nanboya.com/tokei-kaitori/price-list/rolex/gmt-master/ref-16710/' },
      { label: 'ブラリバ相場', url: 'https://brandrevalue.com/cat/watch/rolex/rolex-gmt-master2/16710' },
      { label: 'エニティ参考価格', url: 'https://brand-enity.com/watch/rolex/gmt-master/16710' },
    ] },
  }),
  build({
    slug: 'rolex-submariner-126610ln', modelName: 'サブマリーナ デイト', shortName: 'サブマリーナ', reference: '126610LN',
    officialUrl: 'https://hikakaku.com/category/all-category/watch/items/3785901/', decision: 'GO-A',
    evidenceNote: '2025年8月〜2026年8月に掲載された別々の査定実績です。明らかな桁違いの掲載値は使用していません。',
    appraisals: [e('2025-08-08','中古品・使用感あり','おたからや',1980000),e('2026-08-19','中古美品','エステメ 福岡天神店',2030000),e('2026-03-12','中古品・使用感あり','買虎',2200000)],
    appraisalFocus: ['型番と41mm仕様','セラミックベゼル','ケース・ブレスレットの傷','箱・保証書・余りコマ'],
    modelCase: { amountA: 1980000, amountB: 2030000, amountC: 2050000, amountD: 2190000, amountFinal: 2050000, sourceLinks: [
      { label: 'ヒカカク！', url: 'https://hikakaku.com/category/all-category/watch/items/3785901/' },
      { label: 'なんぼや相場', url: 'https://nanboya.com/tokei-kaitori/price-list/rolex/submarina/' },
      { label: '大黒屋参考価格', url: 'https://kaitori.e-daikoku.com/rolex/shop/hakata/' },
      { label: 'カメラのキタムラ相場', url: 'https://ns-prod.kitamura.shop/watch/sell/item/0000900301/price/' },
    ] },
  }),
];

export const watchModelStoryBySlug = Object.fromEntries(
  watchModelStories.map((story) => [story.slug, story]),
) as Record<string, WatchModelStory>;
