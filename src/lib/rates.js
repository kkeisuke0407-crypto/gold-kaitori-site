// ───────────────────────────────────────────────────────────────
// 金・プラチナ相場の「唯一の取得元」
// すべてのページはここから相場を取得する（ページごとに別実装にしない）。
//
// 設計：
//   ・相場の「取得」はビルドから分離している（ネット依存でビルドが不安定になるのを防ぐ）。
//   ・実取得は scripts/update-rates.mjs が担当し、純金(K24)・純プラチナ(Pt1000)の
//     田中貴金属「店頭買取価格」を src/data/rates.json に書き出す。
//     取得元は 田中貴金属（主）→ 三菱マテリアル（副）→ 前回成功データ維持。
//   ・各純度（K22/K18/Pt900…）の価格は、まねきや公開の純度別買取価格から求めた
//     「純度比」で K24 / Pt1000 から算出する（＝withDerived）。
//     実店舗の価格とは手数料等で多少ずれるため、表示側に注釈を出す。
// ───────────────────────────────────────────────────────────────

import ratesData from "../data/rates.json";

// 相場の地金参照に使っている公的ソース（表示の出典リンク用）。
export const MARKET_SOURCE_URL = "https://gold.tanaka.co.jp/commodity/souba/d-gold.php";

// まねきや公開の純度別買取価格から算出した純度比（純金K24 / 純プラチナPt1000 を1とする）。
// 単純な純度（18/24 等）ではなく実勢比に合わせてあるため、各店の表示に近づく。
const GOLD_RATIO = {
  k24: 1,
  k22: 0.9194,
  k216: 0.8972, // K21.6
  k20: 0.8205,
  k18: 0.7550,
  k18wg: 0.7540,
  k14: 0.5846,
  k14wg: 0.5714,
  k10: 0.4052,
  k9: 0.3639,
};
const PT_RATIO = {
  pt1000: 1,
  pt950: 0.9491,
  pt900: 0.9267,
  pt850: 0.8707,
};

export function parseYen(value) {
  return Number(String(value ?? "").replace(/[^\d-]/g, ""));
}

export function yen(value) {
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function withDerived(base) {
  const k24 = base.gold;
  const pt1000 = base.pt1000;
  const g = (ratio) => Math.round(k24 * ratio);
  const p = (ratio) => Math.round(pt1000 * ratio);
  return {
    ...base,
    // 金：純金(K24)から純度比で各カラットを算出
    k24,
    k22: g(GOLD_RATIO.k22),
    k216: g(GOLD_RATIO.k216),
    k20: g(GOLD_RATIO.k20),
    k18: g(GOLD_RATIO.k18),
    k18wg: g(GOLD_RATIO.k18wg),
    k14: g(GOLD_RATIO.k14),
    k14wg: g(GOLD_RATIO.k14wg),
    k10: g(GOLD_RATIO.k10),
    k9: g(GOLD_RATIO.k9),
    // プラチナ：純プラチナ(Pt1000)から純度比で算出
    pt1000,
    pt950: p(PT_RATIO.pt950),
    pt900: p(PT_RATIO.pt900),
    pt850: p(PT_RATIO.pt850),
    sourceUrl: MARKET_SOURCE_URL,
  };
}

// 全ページで同じ結果を共有する（ページ間のズレを防ぐ）。
export function getRates() {
  return withDerived(ratesData);
}
