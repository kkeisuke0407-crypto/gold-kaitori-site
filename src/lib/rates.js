// ───────────────────────────────────────────────────────────────
// 金・プラチナ相場の「唯一の取得元」
// すべてのページはここから相場を取得する（ページごとに別実装にしない）。
// これにより、サイト内のどのページでも常に同じ・正しい数字を表示する。
//
// 取得元：まねきや公式の本日相場（https://manekiya.shop/rate/）
// 反映タイミング：本サイトは静的生成のため、ビルド時に取得した値を表示する。
//   → .github/workflows/deploy.yml の cron で毎日自動再ビルドして最新化している。
// ───────────────────────────────────────────────────────────────

export const MARKET_SOURCE_URL = "https://manekiya.shop/rate/";

// 取得・解析に失敗したときだけ使う最終手段の値（唯一のフォールバック）。
// 通常運用ではビルド時に必ず最新値で上書きされる。
const FALLBACK = {
  updatedAt: "2026年5月29日 現在",
  pt1000: 10602,
  pt900: 9648,
  pt850: 9065,
  ptDiff: -26,
  gold: 25132,
  goldDiff: 195,
  k18: 18824,
};

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
    // Pt950 は相場ページに単独表記がないため Pt1000 と Pt900 から概算する
    pt950: Math.round((pt1000 + pt900) / 2),
    k24,
    k22: base.k22 != null ? base.k22 : Math.round((k24 * 22) / 24),
    k14: base.k14 != null ? base.k14 : Math.round((k24 * 14) / 24),
    sourceUrl: MARKET_SOURCE_URL,
  };
}

async function fetchRates() {
  try {
    const res = await fetch(MARKET_SOURCE_URL);
    if (!res.ok) throw new Error("rate_fetch_failed");
    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const u = text.match(/※?\s*(20\d{2})年(\d{1,2})月(\d{1,2})日\s*現在/);
    // 「金 25,132円（前日比 +195 円）」/「Pt 10,602円（前日比 -26 円）」前日比は任意
    const goldB = text.match(/金\s+([\d,]+)円(?:\s*（前日比\s*([+-]?\d[\d,]*)\s*円）)?/);
    const ptB = text.match(/Pt\s+([\d,]+)円(?:\s*（前日比\s*([+-]?\d[\d,]*)\s*円）)?/);
    const pt900M = text.match(/Pt900\s+([\d,]+)円/);
    const pt850M = text.match(/Pt850\s+([\d,]+)円/);
    const k18M = text.match(/K18\s+([\d,]+)円/) || text.match(/18金\s+([\d,]+)円/);
    const k22M = text.match(/K22\s+([\d,]+)円/) || text.match(/22金\s+([\d,]+)円/);
    const k14M = text.match(/K14\s+([\d,]+)円/) || text.match(/14金\s+([\d,]+)円/);

    // 主要な数字（プラチナと金）がどれも取れない場合のみ失敗扱い
    if (!ptB && !pt900M && !goldB) throw new Error("rate_parse_failed");

    const base = {
      ok: true,
      updatedAt: u ? `${u[1]}年${u[2]}月${u[3]}日 更新` : FALLBACK.updatedAt,
      pt1000: ptB ? parseYen(ptB[1]) : FALLBACK.pt1000,
      pt900: pt900M ? parseYen(pt900M[1]) : FALLBACK.pt900,
      pt850: pt850M ? parseYen(pt850M[1]) : FALLBACK.pt850,
      ptDiff: ptB && ptB[2] != null ? parseYen(ptB[2]) : FALLBACK.ptDiff,
      gold: goldB ? parseYen(goldB[1]) : FALLBACK.gold,
      goldDiff: goldB && goldB[2] != null ? parseYen(goldB[2]) : FALLBACK.goldDiff,
      k18: k18M ? parseYen(k18M[1]) : FALLBACK.k18,
      k22: k22M ? parseYen(k22M[1]) : null,
      k14: k14M ? parseYen(k14M[1]) : null,
    };
    return withDerived(base);
  } catch (_) {
    return withDerived({ ok: false, ...FALLBACK });
  }
}

// ビルド中は一度だけ取得し、全ページで同じ結果を共有する（ページ間のズレを防ぐ）。
let _cache = null;
export function getRates() {
  if (!_cache) _cache = fetchRates();
  return _cache;
}
