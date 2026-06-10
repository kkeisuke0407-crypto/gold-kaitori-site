// ───────────────────────────────────────────────────────────────
// 金・プラチナ相場の「唯一の取得元」
// すべてのページはここから相場を取得する（ページごとに別実装にしない）。
// これにより、サイト内のどのページでも常に同じ・正しい数字を表示する。
//
// 設計：
//   ・相場の「取得」はビルドから分離している（ネット依存でビルドが不安定になるのを防ぐ）。
//   ・実取得は scripts/update-rates.mjs が担当し、結果を src/data/rates.json に書き出す。
//     取得元は 田中貴金属（主）→ 三菱マテリアル（副）→ 前回成功データ維持（フェイルオーバー）。
//   ・このモジュールは rates.json を読むだけ。よってビルドは常に決定的で失敗しない。
//   ・rates.json は GitHub Actions（毎日 cron）で更新され、成功時はコミットされる
//     ＝1社が落ちても、両社が落ちても「前回の正しい値」を維持し、価格が凍結しない。
// ───────────────────────────────────────────────────────────────

import ratesData from "../data/rates.json";

// 相場の地金参照に使っている公的ソース（表示の出典リンク用）。
export const MARKET_SOURCE_URL = "https://gold.tanaka.co.jp/commodity/souba/";

export function parseYen(value) {
  return Number(String(value ?? "").replace(/[^\d-]/g, ""));
}

export function yen(value) {
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function withDerived(base) {
  const pt1000 = base.pt1000;
  const pt900 = base.pt900;
  // 金のカラット別単価。K24＝「金」買取単価。K22/K14は単独表記がないため純度比で概算する
  const k24 = base.gold;
  return {
    ...base,
    // Pt950 は単独表記がないため Pt1000 と Pt900 から概算する
    pt950: Math.round((pt1000 + pt900) / 2),
    k24,
    k22: base.k22 != null ? base.k22 : Math.round((k24 * 22) / 24),
    k14: base.k14 != null ? base.k14 : Math.round((k24 * 14) / 24),
    sourceUrl: MARKET_SOURCE_URL,
  };
}

// 全ページで同じ結果を共有する（ページ間のズレを防ぐ）。
export function getRates() {
  return withDerived(ratesData);
}
