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

const DEBUG = process.env.DEBUG_RATES === "1";
let lastDebug = null;

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

const toNum = (s) => Number(String(s).replace(/[^\d]/g, ""));
const inRange = (n, [lo, hi]) => n >= lo && n <= hi;

// 完全なカンマ区切り数値だけを拾う正規表現（左右に数字やカンマが続かない）。
// これにより「717,822」「405,943」等のコイン/バー価格が「17,822」「5,943」へ断片化されるのを防ぐ。
const FULL_NUM = /(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d.,])/g;

// 金・プラチナの「買取価格」を抽出する。
//  優先：田中式の「買取価格前日比）〔値〕」ラベル直後（コイン/バー価格に汚染されない）。
//  予備：『買取』直後に現れる完全数値（三菱など他ソース向け）。
// いずれも妥当性レンジで金/プラチナを振り分け、レンジ内の最大値（＝最高純度の買取単価）を採用。
function extractBuyPrices(text) {
  let buys = [...text.matchAll(/買取価格前日比[）)]?\s*([\d,]{4,})/g)].map((m) => toNum(m[1]));
  if (buys.length < 2) {
    buys = [...text.matchAll(new RegExp("買取[^0-9]{0,10}(" + FULL_NUM.source + ")", "g"))].map((m) => toNum(m[1]));
  }
  const golds = buys.filter((n) => inRange(n, GOLD_RANGE));
  const pts = buys.filter((n) => inRange(n, PT_RANGE));
  const gold = golds.length ? Math.max(...golds) : null;
  const pt1000 = pts.length ? Math.max(...pts) : null;
  return { gold, pt1000, _golds: golds, _pts: pts };
}

async function fromSource(name, urls) {
  try {
    const texts = [];
    for (const u of urls) texts.push(await fetchText(u));
    const joined = texts.join(" ");
    if (DEBUG) {
      console.log(`\n[debug] ===== ${name} stripped text (先頭2500字) =====\n${joined.slice(0, 2500)}\n[debug] ===== ここまで =====`);
      // 金/プラチナ/パラジウム/銀 などラベル周辺の金額を文脈付きで全部出す
      for (const m of joined.matchAll(/(.{14})(\d{1,3}(?:,\d{3})+)(.{6})/g)) {
        console.log(`[debug] price: …${m[1]}〔${m[2]}〕${m[3]}…`);
      }
    }
    const { gold, pt1000, _golds, _pts } = extractBuyPrices(joined);
    console.log(`[update-rates] ${name}: gold候補=${JSON.stringify(_golds.slice(0, 6))} pt候補=${JSON.stringify(_pts.slice(0, 6))}`);
    lastDebug = {
      source: name,
      golds: _golds,
      pts: _pts,
      kaitori: [...joined.matchAll(/(.{8})(買取価格前日比[）)]?\s*[\d,]{4,})/g)].slice(0, 12).map((m) => m[1] + m[2]),
      tentou: [...joined.matchAll(/(店頭買取価格[^0-9]{0,12}[\d,]{4,})/g)].slice(0, 12).map((m) => m[1]),
    };
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
  if (DEBUG) {
    console.log("[debug] DEBUG_RATES=1：田中・三菱の両方をダンプします（書き込みなし）");
    await fromSource("田中貴金属(souba)", ["https://gold.tanaka.co.jp/commodity/souba/"]);
    await fromSource("田中貴金属(top)", ["https://gold.tanaka.co.jp/"]);
    await fromSource("三菱マテリアル(gold)", ["https://gold.mmc.co.jp/market/gold-price/"]);
    await fromSource("三菱マテリアル(pt)", ["https://gold.mmc.co.jp/market/platinum-price/"]);
    return;
  }

  let prev = {};
  try {
    prev = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  } catch {
    console.warn("[update-rates] 既存 rates.json を読めず。空から開始。");
  }

  const fetched =
    (await fromSource("田中貴金属", [
      "https://gold.tanaka.co.jp/commodity/souba/d-gold.php",
      "https://gold.tanaka.co.jp/commodity/souba/d-platinum.php",
      "https://gold.tanaka.co.jp/commodity/souba/",
    ])) ||
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
    // 1日であり得ない大きさの差（前回シード/取得元切替などの段差）は前日比として採用しない。
    // 日次変動は通常数%以内。閾値(12%)超えは段差とみなし0扱いにして誤報を防ぐ。
    if (Math.abs(goldDiff) > gold * 0.12) goldDiff = 0;
    if (Math.abs(ptDiff) > pt1000 * 0.12) ptDiff = 0;
    prevDay = { date: iso, gold, pt1000 };
  }

  // 基準値（純金K24 / 純プラチナPt1000 の店頭買取単価）と前日比のみ保存する。
  // 各純度は表示時に src/lib/rates.js が純度比で算出する（単一責務）。
  const next = {
    ok: true,
    source,
    updatedAt: label,
    fetchedAt: new Date().toISOString(),
    gold,
    goldDiff,
    pt1000,
    ptDiff,
    prevDay,
    _debug: lastDebug,
  };

  writeFileSync(DATA_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  console.log(`[update-rates] 書き込み完了：${source} / ${label} / 純金${gold} / 純Pt${pt1000}（前日比 金${goldDiff}/Pt${ptDiff}）`);
}

main().catch((e) => {
  console.warn("[update-rates] 想定外エラー（前回データ維持）:", e && e.message);
  // 失敗してもデプロイを止めない
  process.exit(0);
});
