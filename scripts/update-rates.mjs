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

// 田中の「前日比」表記をパースする。スペース/円/各種符号を吸収して符号付き整数にする。
//  例： " -98 円" → -98 ／ " ▲137" → +137 ／ " ±0" → 0 ／ "－95" → -95
//  先頭(価格直後)に現れる「符号? + 数字」を1つだけ取る。前日比が無ければ null。
function parseDiff(ctx) {
  const m = String(ctx || "").match(/\s*([＋+－\-−▲▼△▽±])?\s*([\d,]+)/);
  if (!m) return null;
  const sign = m[1] || "";
  let n = Number(String(m[2]).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (["-", "−", "－", "▼", "▽"].includes(sign)) n = -n;
  else if (sign === "±") n = 0;
  return n;
}

// 金・プラチナの「買取価格」＋「田中公式の前日比」を抽出する。
//  優先：田中式の「買取価格前日比）〔価格〕〔前日比〕」ラベル直後（コイン/バー価格に汚染されない）。
//  予備：『買取』直後に現れる完全数値（三菱など他ソース向け。前日比は取れないので null）。
// いずれも妥当性レンジで金/プラチナを振り分け、レンジ内の最大値（＝最高純度の買取単価）を採用。
// 前日比は「採用した価格の直後の文字列(ctx)」からパースする。これにより
// 田中サイトが公表している前日比をそのまま表示でき、自前計算とのズレが起きない。
function extractBuyPrices(text) {
  // 価格文字列(カンマ付き)と、その直後10文字(前日比を含む)を保持する
  let rows = [...text.matchAll(/買取価格前日比[）)]?\s*([\d,]{4,})(.{0,10})/g)].map((m) => ({
    n: toNum(m[1]),
    ctx: m[2],
  }));
  let official = true;
  if (rows.length < 2) {
    // 予備ソース（三菱など）。前営業比は取れない。
    rows = [...text.matchAll(new RegExp("買取[^0-9]{0,10}(" + FULL_NUM.source + ")", "g"))].map((m) => ({
      n: toNum(m[1]),
      ctx: "",
    }));
    official = false;
  }
  const pick = (range) => {
    const cands = rows.filter((r) => inRange(r.n, range));
    if (!cands.length) return { value: null, diff: null, ctx: "" };
    const top = cands.reduce((a, b) => (b.n > a.n ? b : a));
    return { value: top.n, diff: official ? parseDiff(top.ctx) : null, ctx: top.ctx };
  };
  const g = pick(GOLD_RANGE);
  const p = pick(PT_RANGE);
  return {
    gold: g.value, goldDiffOfficial: g.diff, goldCtx: g.ctx,
    pt1000: p.value, ptDiffOfficial: p.diff, ptCtx: p.ctx,
    _golds: rows.filter((r) => inRange(r.n, GOLD_RANGE)).map((r) => r.n),
    _pts: rows.filter((r) => inRange(r.n, PT_RANGE)).map((r) => r.n),
  };
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
    const { gold, pt1000, goldDiffOfficial, ptDiffOfficial, goldCtx, ptCtx, _golds, _pts } = extractBuyPrices(joined);
    console.log(`[update-rates] ${name}: gold候補=${JSON.stringify(_golds.slice(0, 6))} pt候補=${JSON.stringify(_pts.slice(0, 6))}`);
    if (gold == null || pt1000 == null) {
      throw new Error(`値が取れない gold=${gold} pt1000=${pt1000}`);
    }
    console.log(`[update-rates] ${name}: 採用 gold=${gold}(前日比${goldDiffOfficial}/ctx="${goldCtx}") / pt1000=${pt1000}(前日比${ptDiffOfficial}/ctx="${ptCtx}")`);
    return { gold, pt1000, goldDiffOfficial, ptDiffOfficial, goldCtx, ptCtx, source: name };
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

  const { gold, pt1000, source, goldDiffOfficial, ptDiffOfficial, goldCtx, ptCtx } = fetched;
  const { iso, label } = jstDateString();

  // 前日比：基準は「前日の最終値（クローズ）」。日中の値動きにもライブで追従させる。
  //  ・last      = 直近runの値（毎回更新）。日付が変わった瞬間、これが“前日クローズ”になる。
  //  ・prevClose = 前日クローズ（前日比の基準）。同日内は据え置き。
  //  旧フォーマット(prevDay)からの移行も吸収する。
  const prevLast = prev.last || prev.prevDay || null;

  // ★重要：田中貴金属の当日価格は平日朝(≈9:30 JST)に公表される。
  //   それ以前（早朝run）や土日祝は、取得しても値は「前営業日のまま」。
  //   このとき暦日(iso)だけ翌日へ進めてしまうと、
  //     ・日付ラベルは「今日」なのに数字は前日のまま（数字が合って見えない）
  //     ・前日終値＝当日値となり goldDiff=0（前日比が消える）
  //   という誤表示になる。そこで「暦日は変わったが値が前日最終値と同じ」＝
  //   まだ当日価格が出ていない、と判断し、前回スナップショットを丸ごと据え置く
  //   （日付ラベルも前営業日のまま）。値が実際に動いた＝当日価格が公表された
  //   ときだけ日付・前日比を確定させる。これで前日比が0へ化けることはない。
  const isNewDay = prevLast && prevLast.date && prevLast.date !== iso;
  const sameValue = prevLast && prevLast.gold === gold && prevLast.pt1000 === pt1000;
  if (isNewDay && sameValue) {
    console.log("[update-rates] 暦日は変わったが田中はまだ当日価格未公表（前日と同値）→ 前回スナップショット据え置き");
    return; // rates.json は変更しない（誤った日付前進・前日比0化を防ぐ）
  }

  let prevClose = prev.prevClose || prev.prevDay || null;
  if (isNewDay) {
    prevClose = prevLast; // 当日価格が公表された新しい営業日：前日クローズ＝前日最後の値
  }
  if (!prevClose || prevClose.gold == null) prevClose = { date: iso, gold, pt1000 };

  // 自前計算の前日比（フォールバック）：前日クローズとの差。
  let goldDiff = gold - prevClose.gold;
  let ptDiff = pt1000 - prevClose.pt1000;
  // 1日であり得ない大きさの差（取得元切替などの段差）は前日比として採用しない（閾値12%）。
  if (Math.abs(goldDiff) > gold * 0.12) goldDiff = 0;
  if (Math.abs(ptDiff) > pt1000 * 0.12) ptDiff = 0;

  // ★田中が公式に公表している前日比が取れていれば、それを最優先で採用する。
  //   自前計算はrun時刻に左右されて田中公式とズレることがあるため、
  //   公式値があるかぎりそのまま表示する（＝サイトの前日比が田中と必ず一致）。
  //   公式値が異常（レンジ外）なら自前計算にフォールバック。
  const sane = (d, base) => d != null && Number.isFinite(d) && Math.abs(d) <= base * 0.12;
  if (sane(goldDiffOfficial, gold)) goldDiff = goldDiffOfficial;
  if (sane(ptDiffOfficial, pt1000)) ptDiff = ptDiffOfficial;

  const last = { date: iso, gold, pt1000 };

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
    prevClose,
    last,
    // 検証用：田中公式の前日比と、価格直後の生コンテキスト（パース確認のため一時保存）
    diffSource: (sane(goldDiffOfficial, gold) || sane(ptDiffOfficial, pt1000)) ? "田中公式" : "自前計算",
    _goldDiffOfficial: goldDiffOfficial ?? null,
    _ptDiffOfficial: ptDiffOfficial ?? null,
    _goldCtx: goldCtx ?? "",
    _ptCtx: ptCtx ?? "",
  };

  // 値・日付・スナップショットが前回と同一なら書き込まない（fetchedAtだけの差分で
  // 毎ビルド自動コミットが乱発するのを防ぐ）。日付が変わるか価格が動いた時だけ更新。
  const sansTime = (o) => {
    const c = { ...(o || {}) };
    delete c.fetchedAt;
    return JSON.stringify(c);
  };
  if (sansTime(prev) === sansTime(next)) {
    console.log("[update-rates] 値・日付に変化なし → 書き込みスキップ（無駄なコミット抑制）");
    return;
  }

  writeFileSync(DATA_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  console.log(`[update-rates] 書き込み完了：${source} / ${label} / 純金${gold} / 純Pt${pt1000}（前日比 金${goldDiff}/Pt${ptDiff}）`);
}

main().catch((e) => {
  console.warn("[update-rates] 想定外エラー（前回データ維持）:", e && e.message);
  // 失敗してもデプロイを止めない
  process.exit(0);
});
