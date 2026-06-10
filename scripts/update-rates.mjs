// ───────────────────────────────────────────────────────────────
// 相場データ自動更新スクリプト（GitHub Actions から毎日実行）
//
//   田中貴金属（主） → 三菱マテリアル（副） → 前回成功データ維持
//
// ・どちらか取れれば最新値を採用。両方失敗したら src/data/rates.json は変更せず終了（凍結回避）。
// ・金(純金=K24)・プラチナ(純プラチナ=Pt1000) の「買取価格(円/g)」を取得し、
//   K18 / Pt950 / Pt900 / Pt850 は純度比で派生させる。
// ・前日比は「日付が変わったとき」だけ前日スナップショットとの差で算出する。
// ・失敗してもプロセスは必ず exit 0（デプロイを止めない）。詳細はログに出す。
// ───────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "src", "data", "rates.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 妥当性レンジ（円/g）。これを外れた値は採用しない（誤パース防止）。
const GOLD_RANGE = [14001, 80000];
const PT_RANGE = [2000, 14000];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`status=${res.status}`);
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&yen;|&#165;/g, "¥")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

// テキスト中の「○,○○○」形式の金額を全部拾う（4〜6桁・カンマ区切り）。
function pricesInRange(text, [lo, hi]) {
  const out = [];
  for (const m of text.matchAll(/(\d{1,2},\d{3})(?!\d)/g)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (n >= lo && n <= hi) out.push(n);
  }
  return out;
}

// 金額レンジで金・プラチナを切り分け、各クラスタの最小値=買取価格(買取<小売)とみなす。
function extractBuyPrices(text) {
  const golds = pricesInRange(text, GOLD_RANGE);
  const pts = pricesInRange(text, PT_RANGE);
  const gold = golds.length ? Math.min(...golds) : null;
  const pt1000 = pts.length ? Math.min(...pts) : null;
  return { gold, pt1000, _golds: golds, _pts: pts };
}

async function fromSource(name, urls) {
  try {
    const texts = [];
    for (const u of urls) texts.push(await fetchText(u));
    const joined = texts.join(" ");
    const { gold, pt1000, _golds, _pts } = extractBuyPrices(joined);
    console.log(`[update-rates] ${name}: gold候補=${JSON.stringify(_golds.slice(0, 6))} pt候補=${JSON.stringify(_pts.slice(0, 6))}`);
    if (gold == null || pt1000 == null) {
      throw new Error(`値が取れない gold=${gold} pt1000=${pt1000}`);
    }
    console.log(`[update-rates] ${name}: 採用 gold=${gold} / pt1000=${pt1000}`);
    return { gold, pt1000, source: name };
  } catch (e) {
    console.warn(`[update-rates] ${name}: 失敗 — ${e && e.message}`);
    return null;
  }
}

function jstDateString(d = new Date()) {
  // JST(UTC+9) の yyyy-mm-dd と 表示用「YYYY年M月D日」を返す
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  return { iso: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`, label: `${y}年${m}月${day}日 現在` };
}

async function main() {
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  } catch {
    console.warn("[update-rates] 既存 rates.json を読めず。空から開始。");
  }

  const fetched =
    (await fromSource("田中貴金属", ["https://gold.tanaka.co.jp/commodity/souba/"])) ||
    (await fromSource("三菱マテリアル", [
      "https://gold.mmc.co.jp/market/gold-price/",
      "https://gold.mmc.co.jp/market/platinum-price/",
    ]));

  if (!fetched) {
    console.warn("[update-rates] 全ソース失敗。前回成功データを維持して終了（凍結回避）。");
    return; // rates.json は変更しない
  }

  const { gold, pt1000, source } = fetched;
  const { iso, label } = jstDateString();

  // 前日比：日付が変わったときだけ前日スナップショットとの差で更新（同日内は据え置き）。
  let goldDiff = prev.goldDiff ?? 0;
  let ptDiff = prev.ptDiff ?? 0;
  let prevDay = prev.prevDay && prev.prevDay.date ? prev.prevDay : { date: iso, gold, pt1000 };
  if (prevDay.date !== iso) {
    goldDiff = gold - prevDay.gold;
    ptDiff = pt1000 - prevDay.pt1000;
    prevDay = { date: iso, gold, pt1000 };
  }

  const next = {
    ok: true,
    source,
    updatedAt: label,
    fetchedAt: new Date().toISOString(),
    gold,
    goldDiff,
    // K18 / Pt950 / Pt900 / Pt850 は純度比で派生（純度ベースの地金参考）
    k18: Math.round(gold * 0.75),
    pt1000,
    pt900: Math.round(pt1000 * 0.9),
    pt850: Math.round(pt1000 * 0.85),
    ptDiff,
    prevDay,
  };

  writeFileSync(DATA_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  console.log(`[update-rates] 書き込み完了：${source} / ${label} / 金${gold} K18${next.k18} Pt1000${pt1000} Pt900${next.pt900} Pt850${next.pt850}（前日比 金${goldDiff}/Pt${ptDiff}）`);
}

main().catch((e) => {
  console.warn("[update-rates] 想定外エラー（前回データ維持）:", e && e.message);
  // 失敗してもデプロイを止めない
  process.exit(0);
});
