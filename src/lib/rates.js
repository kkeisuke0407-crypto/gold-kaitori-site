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

// まねきや公開値（2026/6/10・6/11 の純度別買取表）から測定した実測係数。
// 田中の「純金/純プラチナ買取単価」＝まねきやの「地金(インゴット)」価格 に対して、
// この係数を掛けると、まねきやの純度別「買取」相場をそのまま再現できる。
//   係数 ＝ (まねきや 純度別買取_x) ÷ (まねきや 地金) を2日分で測定（両日ほぼ一致＝安定）。
//   ＝ 純度比 だけでなく「地金→製品買取の店掛け率(金≈0.992 / Pt≈0.982)」も織り込み済み。
// K24 / Pt1000 は地金(インゴット)値そのものを表示する（係数1.0扱い）。
const GOLD_COEF = {
  k22: 0.91199,
  k216: 0.88999, // K21.6
  k20: 0.81398,
  k18: 0.74902,
  k18wg: 0.74801,
  k14: 0.57996,
  k14wg: 0.56687,
  k10: 0.40199,
  k9: 0.36100,
};
const PT_COEF = {
  pt950: 0.93205,
  pt900: 0.91005,
  pt850: 0.85495,
};

export function parseYen(value) {
  return Number(String(value ?? "").replace(/[^\d-]/g, ""));
}

export function yen(value) {
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function withDerived(base) {
  // K24 / Pt1000 ＝ 地金(インゴット)＝田中の純金/純プラチナ買取単価
  const k24 = base.gold;
  const pt1000 = base.pt1000;
  const gk = (c) => Math.round(k24 * c);
  const pk = (c) => Math.round(pt1000 * c);
  return {
    ...base,
    // 金：地金K24 に実測係数を掛けて純度別買取を算出
    k24,
    k22: gk(GOLD_COEF.k22),
    k216: gk(GOLD_COEF.k216),
    k20: gk(GOLD_COEF.k20),
    k18: gk(GOLD_COEF.k18),
    k18wg: gk(GOLD_COEF.k18wg),
    k14: gk(GOLD_COEF.k14),
    k14wg: gk(GOLD_COEF.k14wg),
    k10: gk(GOLD_COEF.k10),
    k9: gk(GOLD_COEF.k9),
    // プラチナ：地金Pt1000 に実測係数を掛けて純度別買取を算出
    pt1000,
    pt950: pk(PT_COEF.pt950),
    pt900: pk(PT_COEF.pt900),
    pt850: pk(PT_COEF.pt850),
    sourceUrl: MARKET_SOURCE_URL,
  };
}

// 全ページで同じ結果を共有する（ページ間のズレを防ぐ）。
export function getRates() {
  return withDerived(ratesData);
}
