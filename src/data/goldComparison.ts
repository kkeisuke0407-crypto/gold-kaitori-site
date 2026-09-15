export type GoldComparisonCompany = {
  rank: number;
  id: "manekiya" | "otakaraya" | "brandrevalue";
  name: string;
  label: string;
  bestFor: string;
  methods: string;
  categories: string;
  decisionPoint: string;
  caution: string;
  href: string;
  affiliate: boolean;
  sourceUrl: string;
};

export const GOLD_COMPARISON_UPDATED_AT = "2026-09-13";

export const goldComparisonCompanies: GoldComparisonCompany[] = [
  {
    rank: 1,
    id: "manekiya",
    name: "まねきや",
    label: "まず価値を確認したい方",
    bestFor: "素材が分からない品や、整理中に見つかった貴金属を相談したい方",
    methods: "店頭・出張・宅配",
    categories: "金・貴金属、プラチナ、宝石、ブランド品など",
    decisionPoint: "当日の貴金属相場、取扱カテゴリ、3つの買取方法を公式で確認できる",
    caution: "店舗により取扱品目が異なる場合があります。申込前に対象品・費用・キャンセル条件をご確認ください。",
    href: "https://ad-fam.com/ad/p/r?_site=49248&_article=16522",
    affiliate: true,
    sourceUrl: "https://manekiya.shop/"
  },
  {
    rank: 2,
    id: "otakaraya",
    name: "おたからや",
    label: "店舗網・出張査定も比べたい方",
    bestFor: "近隣店舗や出張査定を比較材料にしたい方",
    methods: "店頭・出張・メール・LINE",
    categories: "金・貴金属、宝石・ジュエリー、ブランド品など",
    decisionPoint: "全国の店舗網と出張査定を公式で確認できる",
    caution: "利用方法や品物により手数料の扱いが異なる場合があります。最終的な支払額をご確認ください。",
    href: "https://www.otakaraya.jp/",
    affiliate: false,
    sourceUrl: "https://www.otakaraya.jp/visiting/"
  },
  {
    rank: 3,
    id: "brandrevalue",
    name: "ブラリバ",
    label: "宝石・ブランド価値も見てほしい方",
    bestFor: "宝石付きやブランドジュエリーを含めて相談したい方",
    methods: "店頭・宅配・出張",
    categories: "金・貴金属、宝石、ダイヤ、ブランドジュエリーなど",
    decisionPoint: "来店不要の査定方法や、査定後のキャンセル案内を公式で確認できる",
    caution: "品物・方法・地域ごとの対象条件と、返送を含む費用条件をご確認ください。",
    href: "https://brandrevalue.com/",
    affiliate: false,
    sourceUrl: "https://brandrevalue.com/service/"
  }
];

export const goldComparisonPolicy = [
  "掲載順位は、ずらし検索から価値確認へ進む際の分かりやすさを基準にした当サイトの編集方針です。",
  "買取価格の高さ、査定結果、キャンペーン適用を保証する順位ではありません。",
  "価格だけでなく、対象品、査定方法、費用、キャンセル条件を公式情報で確認してから選びます。"
];
