// ───────────────────────────────────────────────────────────────
// おたからやの「店舗数」の唯一の取得元。
// 全ページはここから店舗数を参照する（各ページに数字をベタ書きしない）。
//
// 設計（相場 rates.js と同じ思想）：
//   ・実取得は scripts/update-otakaraya.mjs が担当し、おたからや公式から
//     店舗数を取得して src/data/otakaraya.json に書き出す（ベストエフォート）。
//   ・取得できないとき（botブロック等）は前回値を維持（誤表示しない）。
//   ・取得が一切できない環境でも、このJSONを1行直すだけで全LPへ即反映できる。
// ───────────────────────────────────────────────────────────────

import data from "../data/otakaraya.json";

export function getOtakaraya() {
  const stores = Number(data.stores) || 0;
  return {
    stores,
    // 「1,850」のようなカンマ区切り表記
    storesComma: stores.toLocaleString("ja-JP"),
    // 「2026年6月」などの時点表記
    asOf: data.asOf || "",
  };
}
