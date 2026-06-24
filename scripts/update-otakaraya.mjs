// ───────────────────────────────────────────────────────────────
// おたからや「店舗数」自動更新スクリプト（GitHub Actions から実行・ベストエフォート）
//
//   おたからや公式（LP・コーポレート）から「○○店舗」を抽出して
//   src/data/otakaraya.json を更新する。
//
// 設計（相場 update-rates.mjs と同じ思想）：
//   ・取得できれば最新値を採用。取得できない／妥当値が拾えないときは
//     既存JSONを変更せず終了（凍結＝前回値維持で誤表示しない）。
//   ・店舗数が前回と同じなら書き込まない（無駄な自動コミット抑制）。
//   ・おたからや側がbotブロック(403等)の場合は空振りするが、その場合も
//     既存値を維持するだけなので害はない（手動なら otakaraya.json を1行直せば全反映）。
//   ・失敗してもプロセスは必ず exit 0（デプロイを止めない）。
// ───────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "src", "data", "otakaraya.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 妥当性レンジ（店舗）。これを外れた値は採用しない（誤パース防止）。
// おたからやは概ね1,800店舗台。将来の増減を見込んで広めに取る。
const STORE_RANGE = [1200, 6000];

// 取得元（複数。どれか1つでも妥当値が拾えれば確定）。
const SOURCES = [
  "https://lp.otakaraya.jp/lp-gold-a/",
  "https://www.otakaraya.jp/",
  "https://www.otakaraya.jp/company/",
];

const DEBUG = process.env.DEBUG_OTAKARAYA === "1";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (DEBUG) console.log(`[debug] GET ${url} → status=${res.status}`);
  if (!res.ok) throw new Error(`status=${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 「○○店舗」の数字を抽出してレンジ内の最大値を返す（最大＝最新の総店舗数とみなす）。
// 「1,850店舗」「1850 店舗」「店舗数 1,850」などの表記ゆれを吸収する。
function extractStores(text) {
  const nums = new Set();
  const push = (raw) => {
    const n = Number(String(raw).replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n >= STORE_RANGE[0] && n <= STORE_RANGE[1]) nums.add(n);
  };
  // 数字 + 店舗
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})|\d{4,5})\s*店舗/g)) push(m[1]);
  // 店舗数 + 数字
  for (const m of text.matchAll(/店舗数[^\d]{0,6}(\d{1,3}(?:,\d{3})|\d{4,5})/g)) push(m[1]);
  const list = [...nums];
  if (DEBUG) console.log(`[debug] 店舗候補: ${JSON.stringify(list)}`);
  if (!list.length) return null;
  return Math.max(...list);
}

function jstYearMonth(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月`;
}

async function main() {
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  } catch {
    console.warn("[update-otakaraya] 既存 otakaraya.json を読めず。空から開始。");
  }

  let stores = null;
  let usedSource = null;
  for (const url of SOURCES) {
    try {
      const text = await fetchText(url);
      const n = extractStores(text);
      if (n != null) {
        stores = n;
        usedSource = url;
        break;
      }
      console.warn(`[update-otakaraya] ${url}: 店舗数が拾えず`);
    } catch (e) {
      console.warn(`[update-otakaraya] ${url}: 失敗 — ${e && e.message}`);
    }
  }

  if (stores == null) {
    console.warn("[update-otakaraya] 全ソースで取得失敗 → 前回値を維持して終了（凍結回避）。");
    return; // otakaraya.json は変更しない
  }

  if (prev.stores === stores) {
    console.log(`[update-otakaraya] 店舗数に変化なし（${stores}）→ 書き込みスキップ。`);
    return;
  }

  const next = {
    stores,
    asOf: jstYearMonth(),
    source: usedSource,
    fetchedAt: new Date().toISOString(),
  };
  writeFileSync(DATA_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  console.log(`[update-otakaraya] 書き込み完了：${stores}店舗（${next.asOf} / ${usedSource}）`);
}

main().catch((e) => {
  console.warn("[update-otakaraya] 想定外エラー（前回データ維持）:", e && e.message);
  process.exit(0);
});
