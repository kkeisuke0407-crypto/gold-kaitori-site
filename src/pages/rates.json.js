// 静的HTMLのページ（/public 配下）から、ビルド時の最新相場を読めるようにする
// JSONエンドポイント。GitHub Actions の相場自動更新にそのまま追従する。
import { getRates } from "../lib/rates.js";

export function GET() {
  const r = getRates();
  const body = {
    updatedAt: r.updatedAt,
    source: r.source,
    sourceUrl: r.sourceUrl,
    isStale: r.isStale ?? false,
    gold: r.gold,
    goldDiff: r.goldDiff,
    goldRetail: r.goldRetail ?? null, // 田中の店頭小売価格（税込）。過去最高値（小売）との比較用
    k24: r.k24,
    k22: r.k22,
    k18: r.k18,
    k14: r.k14,
    k10: r.k10,
    pt1000: r.pt1000,
  };
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
