#!/usr/bin/env node
/*
 * 比較記事型LP（N社比較 → 2社推薦）を、ひな形から一発生成する。
 *
 *   使い方:  npm run new-hikaku -- scripts/hikaku-configs/<slug>.config.mjs
 *   または:  node scripts/new-hikaku.mjs scripts/hikaku-configs/<slug>.config.mjs
 *
 * ひな形    : templates/hikaku-lp/index.html + style.css
 * 完成見本  : public/manekiya-otakaraya/
 * 作り方    : docs/比較記事LPの雛形.md
 *
 * 生成先は public/<slug>/ （Astroが public/ をそのままコピーして公開する）。
 * 構造・CSS・CV計測・キャンペーン日付・相場計算機はひな形から継承され、
 * config に書いた「案件ごとに変わる値」だけが差し替わる。
 *
 * config の文字列は基本的に **HTMLとして** 埋め込まれる（<strong> 等が使える）。
 * ただし alt / aria-label に入る値は属性としてエスケープされる。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";

const SITE = "https://kaitori.hakobu-family.com";
const TPL_DIR = "templates/hikaku-lp";

/* ---------------------------------------------------------------- 小道具 */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const strip = (s) => String(s ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const indent = (n, lines) => lines.map((l) => " ".repeat(n) + l).join("\n");
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

/* ---------------------------------------------------------------- config */
const configArg = process.argv[2];
if (!configArg) die("使い方: node scripts/new-hikaku.mjs scripts/hikaku-configs/<slug>.config.mjs");
const cfg = (await import(pathToFileURL(resolve(configArg)).href)).default;

for (const k of ["slug", "title", "desc", "item", "landingIntent", "hero", "primary", "secondary"]) {
  if (!cfg[k]) die(`config に必須項目がありません: ${k}`);
}
if (!/^[a-z0-9-]+$/.test(cfg.slug)) die(`slug は英小文字・数字・ハイフンのみ: ${cfg.slug}`);
const P = cfg.primary, S = cfg.secondary;
for (const [obj, label] of [[P, "primary"], [S, "secondary"]]) {
  for (const k of ["name", "url", "banner"]) if (!obj[k]) die(`${label}.${k} は必須です`);
}
if (!S.host) die("secondary.host は必須です（例 \"otakaraya.jp\"）。CV計測で成果/非成果を分ける判定に使う");
if (!cfg.hero.src || !cfg.hero.alt) die("hero.src と hero.alt は必須です");
if (!Array.isArray(cfg.companies) || cfg.companies.length < 2) die("companies は2社以上の配列で指定してください");

/* ------------------------------------------------------- 既定値の埋め合わせ */
const d = (v, fallback) => (v === undefined || v === null || v === "" ? fallback : v);
const ITEM = cfg.item;
const P_REL = d(P.rel, "sponsored nofollow noopener noreferrer");
const S_REL = d(S.rel, "nofollow noopener noreferrer");
const CAMP = d(P.campaign, {});

// CV計測はリンク先ホストで役割を判定する（class列挙だと付け忘れで計測が消えるため）
const reHost = (h) => h.replace(/\./g, "\\.");
let affHost;
try { affHost = new URL(P.url).hostname.replace(/^www\./, ""); }
catch { die(`primary.url が URL として解釈できません: ${P.url}`); }
if (new URL(S.url).hostname.replace(/^www\./, "").includes(affHost) || affHost.includes(S.host)) {
  die(`primary.url と secondary.host が同じホストです（${affHost} / ${S.host}）。成果と非成果を区別できません`);
}

/* ------------------------------------------------------------ ブロック生成 */

// 比較表：ヘッダ
const cmpHead = d(cfg.cmpHead, ["店名", "得意分野", "運営基盤・店舗網", `対応できる${ITEM}`, "レートの公開状況", "手数料の扱い", "宅配で断る場合", "品質の確認", "上乗せ条件", "査定方法", "受付・現金化の目安", `${ITEM}を売るなら`]);
const CMP_HEAD = cmpHead.map((h, i) => {
  const cls = i === 0 ? ' class="cmp9-sh"' : i === 1 ? ' class="cmp9-specialty"' : i === cmpHead.length - 1 ? ' class="cmp9-verdict"' : "";
  return `<th${cls}>${h}</th>`;
}).join("");

// 比較表：各社の行。cells は cmpHead の2列目以降と同じ数だけ並べる
const CMP_ROWS = cfg.companies.map((c) => {
  const need = cmpHead.length - 1;
  if (!Array.isArray(c.cells) || c.cells.length !== need) {
    die(`companies「${c.name}」の cells は ${need} 個必要です（今 ${c.cells ? c.cells.length : 0} 個）。cmpHead の2列目以降と対応させる`);
  }
  const logo = c.logo
    ? `<span class="cmp9-logo" style="background-image:url(${c.logo})" role="img" aria-label="${esc(c.name)}"></span>`
    : `<span class="cmp9-logo cmp9-logo--text" role="img" aria-label="${esc(c.name)}">${c.logoText || c.name}</span>`;
  const rel = c.candidate ? P_REL : "nofollow noopener";
  const aff = c.candidate ? ' class="kin-aff"' : "";
  const name = `<span class="cmp9-company"><a${aff} href="${c.url}" target="_blank" rel="${rel}"><span class="cmp9-company__name">${c.name}</span>${logo}</a></span>`;
  const tds = c.cells.map((cell, i) => {
    const cls = ["cmp9-specialty", "cmp9-business", "cmp9-scope", "", "", "cmp9-delivery", "", "", "", "cmp9-contact", "cmp9-verdict"][i] || "";
    return `<td${cls ? ` class="${cls}"` : ""}>${cell}</td>`;
  }).join("");
  return `          <tr class="cmp9-row${c.candidate ? " cmp9-candidate" : ""}"><th class="cmp9-sh">${name}</th>${tds}</tr>`;
}).join("\n");

// 会社比較表（2社）
const COMPANY_ROWS = d(cfg.companyRows, []).map(([label, a, b]) =>
  `        <tr><th>${label}</th><td class="is-pick" data-label="${esc(P.name)}">${a}</td><td data-label="${esc(S.name)}">${b}</td></tr>`
).join("\n");

// エリア／店舗
const AREA_ITEMS = indent(8, [d(cfg.areas, []).map((a) => `<li>${a}</li>`).join("")]);
const SHOP_ITEMS = d(cfg.shops, []).map((s) =>
  `      <li><img src="${s.img}" alt="${esc(`${P.name} ${s.name}の外観`)}" loading="lazy"><span>${s.name}<small>${s.pref}</small></span></li>`
).join("\n");

// 口コミ（bad を必ず1本混ぜる運用。混ざっていなければ警告）
const REVIEWS = d(cfg.reviews, []).map((r) =>
  `    <blockquote class="kin-quote${r.bad ? " kin-quote--bad" : ""}"><p>${r.text}</p><cite>${r.name || ""}</cite></blockquote>`
).join("\n");

// リスト系
const listItems = (arr, pad = 6) => d(arr, []).map((x) => `${" ".repeat(pad)}<li>${x}</li>`).join("\n");

// コツ：流し見用リスト＋本文
const tips = d(cfg.tips, []);
const TIPS_SCAN = tips.map((t) => `      <li><strong class="em-mark">${strip(t.title)}</strong></li>`).join("\n");
const TIPS_BODY = tips.map((t, i) => `    <h3>コツ${i + 1}｜${t.title}</h3>\n    <p>${t.body}</p>`).join("\n\n");

// 流れ
const STEPS = d(cfg.steps, []).map((s) =>
  `      <li><p class="kin-step__title">${s.title}</p><p>${s.body}</p></li>`
).join("\n");

// FAQ（表示＋schema。同じ内容を両方に入れる）
const faq = d(cfg.faq, []);
if (faq.length < 5) console.warn("⚠ faq が5問未満です。比較記事型は10問以上を推奨（検索意図の取りこぼしになる）");
const FAQ_HTML = faq.map((f) => `      <p class="kin-faq__q">${f.q}</p>\n      <p class="kin-faq__a">${f.a}</p>`).join("\n\n");
const FAQ_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: strip(f.q), acceptedAnswer: { "@type": "Answer", text: strip(f.a) } })),
});

// まとめ表
const SUMMARY_ROWS = d(cfg.summary, []).map(([sit, pick, why]) =>
  `        <tr><th>${sit}</th><td data-label="おすすめ"><strong>${pick}</strong></td><td data-label="理由">${why}</td></tr>`
).join("\n");

// 免責（既定は現行ページと同じ7項目）
const DISCLAIMER_ITEMS = listItems(d(cfg.disclaimers, [
  "本ページはプロモーションを含みます",
  "本ページは、公開されている情報をもとに編集部が作成した比較・紹介記事です",
  "掲載の◎○△などの評価は当編集部の主観的な比較であり、買取価格の優劣を保証するものではありません。「最大」等のキャンペーンは対象品・上限・併用等の条件があります",
  '掲載内容は<span id="kin-today"></span>時点の情報です。最新の条件は各社公式サイトでご確認ください',
  "買取価格は、相場変動・品物の状態・品質により変動します。掲載の買取実績は特定の取引例であり、同等の金額を保証するものではありません",
  "キャンペーンの適用条件・上限額は申込時にご確認ください",
]), 8);

// CTAブロック（7箇所）。見出しだけ変えて同じ形を反復する
// 見出しの型（詳細は docs/比較記事LPの文章と強調の型.md §4）:
//   ① 行動を最小化    「まずは、いくらになるかだけ。」
//   ② 直前セクションを受ける「5つのコツを踏まえて、」「流れが分かったら、」
//   ③ 断る許可        「金額に納得できなければ、断って構いません。」
// 同じ文を7回使わない。直前に読んだ内容を受けると押しつけにならない。
const ctaHeads = d(cfg.ctaHeads, [
  "まずは、いくらになるかだけ。",
  "金額を聞くだけなら、無料です。",
  "査定＝売る約束ではありません。",
  "手数料込みの総額を、先に聞く。",
  "迷ったら、2社に出す。",
  "電話1本で、今日の金額が分かります。",
  "まずは、手数料込みでいくらになるか。",
]);
const ctaNote = d(cfg.ctaNote, "金額を聞いてから決められます。宅配の返送料を含む条件は申込前に確認してください。");
const ctaBlock = (head, withNote) => `<div class="kin-cta-block">
      <p class="kin-cta-block__head">${head}</p>
      <a class="kin-phone" href="${P.url}" target="_blank" rel="${P_REL}">
        <span class="kin-cta-brand">${P.name}</span>
        <span class="kin-phone__badge">${d(P.phoneBadge, "電話での査定予約がおすすめ")}</span>
        <span class="kin-phone__num">電話で査定予約をする</span>
        <span class="kin-phone__sub">${d(P.hours, "受付時間は公式サイトでご確認ください")}</span>
      </a>
      <a class="kin-cta kin-cta--web" href="${S.url}" target="_blank" rel="${S_REL}"><span class="kin-cta-brand">${S.name}</span>WEBで査定を予約する（1分）</a>${withNote ? `\n      <span class="kin-cta__note">${ctaNote}</span>` : ""}
    </div>`;

// キャンペーン日付スクリプト（monthly = 当月1日〜末日 / weekly = 次の日曜まで）
const campType = d(CAMP.type, "monthly");
if (!["monthly", "weekly"].includes(campType)) die('primary.campaign.type は "monthly" か "weekly"');
const CAMPAIGN_SCRIPT = campType === "monthly"
  ? `/* キャンペーンは「当月1日〜当月末日」。JST基準で毎月自動更新する。 */
(function () {
  var jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  var y = jst.getFullYear(), m = jst.getMonth();
  var start = new Date(y, m, 1);
  var end = new Date(y, m + 1, 0); // 当月末日
  var md = function (dt) { return (dt.getMonth() + 1) + '月' + dt.getDate() + '日'; };
  var days = Math.max(0, Math.ceil((new Date(y, m + 1, 0, 23, 59, 59) - jst) / 86400000));

  var range = document.getElementById('kin-camp-range');
  if (range) range.textContent = md(start) + '〜' + md(end) + (days > 0 ? '｜あと' + days + '日' : '｜本日まで');
  var today = document.getElementById('kin-today');
  if (today) today.textContent = y + '年' + (m + 1) + '月' + jst.getDate() + '日';
}());`
  : `/* キャンペーンは「次の日曜まで」の週次。JST基準で毎週自動更新する。 */
(function () {
  var jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  var end = new Date(jst.getFullYear(), jst.getMonth(), jst.getDate() + ((7 - jst.getDay()) % 7));
  var md = function (dt) { return (dt.getMonth() + 1) + '月' + dt.getDate() + '日'; };
  var days = Math.max(0, Math.round((end - new Date(jst.getFullYear(), jst.getMonth(), jst.getDate())) / 86400000));

  var range = document.getElementById('kin-camp-range');
  if (range) range.textContent = md(end) + 'まで' + (days > 0 ? '｜あと' + days + '日' : '｜本日まで');
  var today = document.getElementById('kin-today');
  if (today) today.textContent = jst.getFullYear() + '年' + (jst.getMonth() + 1) + '月' + jst.getDate() + '日';
}());`;

// 相場計算機（貴金属系のみ。/rates.json = 田中貴金属ベースの自動更新に追従）
const calc = cfg.calc === false ? null : d(cfg.calc, {});
let CALC_HTML = "", CALC_SCRIPT = "";
if (calc) {
  const karats = d(calc.karats, [
    ["k18", "K18（750）", true], ["k24", "K24（純金・999）"], ["k22", "K22（916）"],
    ["k14", "K14（585）"], ["k10", "K10（417）"], ["pt1000", "Pt1000（プラチナ）"],
  ]);
  CALC_HTML = `    <div class="kin-calc" id="kin-calc">
      <div class="kin-calc__head"><span>あなたの${ITEM}、今いくら？</span><span class="kin-calc__date" id="kin-calc-date">相場読み込み中</span></div>
      <div class="kin-calc__body">
        <p class="kin-calc__now">
          <span class="kin-calc__now-label">${d(calc.baseLabel, "純金(K24)")}</span>
          <span class="kin-calc__now-val" id="kin-calc-gold">—</span>
          <span class="kin-calc__now-unit">円/g</span>
          <span class="kin-calc__diff" id="kin-calc-diff"></span>
        </p>
        <p class="kin-calc__src">出典：<a href="${d(calc.sourceUrl, "https://gold.tanaka.co.jp/commodity/souba/d-gold.php")}" target="_blank" rel="noopener noreferrer">${d(calc.sourceName, "田中貴金属 公表の店頭小売価格")}</a>（毎営業日更新）</p>

        <div class="kin-calc__form">
          <label class="kin-calc__field">
            <span>純度（刻印）</span>
            <select id="kin-calc-karat">
${karats.map(([v, l, sel]) => `              <option value="${v}"${sel ? " selected" : ""}>${l}</option>`).join("\n")}
            </select>
          </label>
          <label class="kin-calc__field">
            <span>重さ（g）</span>
            <input id="kin-calc-gram" type="number" inputmode="decimal" min="0" step="0.1" value="10">
          </label>
        </div>

        <div class="kin-calc__result">
          <span class="kin-calc__result-label">ざっくり目安</span>
          <span class="kin-calc__result-val" id="kin-calc-out">—</span>
          <span class="kin-calc__result-note">地金相場ベースの概算です。石・デザインの評価や手数料は含みません。<strong>実際の手取りは査定で変わります。</strong></span>
        </div>

        <div class="kin-calc__cta">
          <a class="kin-cta kin-cta--web kin-aff" href="${P.url}" target="_blank" rel="${P_REL}">この金額を${P.name}で確かめる →</a>
        </div>

        <p class="kin-calc__foot">※ 純度別の係数は一般的な品位をもとにした概算です。</p>
      </div>
    </div>`;
  CALC_SCRIPT = `<script>
/* 本日の相場を読み込んで、かんたん概算を出す（相場は /rates.json = 毎日自動更新） */
(function () {
  var el = function (id) { return document.getElementById(id); };
  if (!el('kin-calc')) return;
  var out = el('kin-calc-out'), karat = el('kin-calc-karat'), gram = el('kin-calc-gram');
  var rates = null;
  function yen(n) { return n.toLocaleString('ja-JP'); }
  function calc() {
    if (!rates) return;
    var unit = rates[karat.value];
    var g = parseFloat(gram.value);
    if (!unit || !isFinite(g) || g <= 0) { out.textContent = '—'; return; }
    out.textContent = '約 ' + yen(Math.round(unit * g)) + ' 円';
  }
  fetch('/rates.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (dt) {
      rates = dt;
      el('kin-calc-gold').textContent = yen(dt.${d(calc.baseKey, "k24")});
      el('kin-calc-date').textContent = dt.updatedAt || '';
      var diff = el('kin-calc-diff');
      if (typeof dt.goldDiff === 'number' && dt.goldDiff !== 0) {
        var up = dt.goldDiff > 0;
        diff.textContent = (up ? '▲+' : '▼') + yen(Math.abs(dt.goldDiff)) + '円';
        diff.className = 'kin-calc__diff ' + (up ? 'kin-calc__diff--up' : 'kin-calc__diff--down');
      }
      calc();
    })
    .catch(function () { el('kin-calc-date').textContent = '公式サイトでご確認ください'; });
  karat.addEventListener('change', calc);
  gram.addEventListener('input', calc);
}());
</script>`;
}

// 税金セクション（貴金属など譲渡所得の説明が要る商材のみ）
const TAX_HTML = cfg.tax === false ? "" : d(cfg.tax, `    <!-- ============ ⑱税金 ============
         ▼書き換え：商材の課税区分に合わせる。断定を避け、必ず「税務署・税理士に確認」で締める。 -->
    <h2>${ITEM}を売ったときの税金</h2>
    <p>生活用動産の売却は原則非課税ですが、地金など資産性のある品は譲渡所得の対象になります。</p>
    <p class="kin-note">※ 一般的な説明です。個別の判断は税務署または税理士にご確認ください。</p>`);

/* ---------------------------------------------------------------- 置換表 */
const tokens = {
  TITLE: cfg.title,
  DESC: cfg.desc,
  CANONICAL: `${SITE}/${cfg.slug}/`,
  OG_IMAGE: d(cfg.ogImage, `${SITE}/${cfg.slug}/${cfg.hero.src}`),
  ASSET_VER: d(cfg.assetVer, new Date().toISOString().slice(0, 10).replace(/-/g, "")),
  ITEM,
  H1: d(cfg.h1, `${ITEM}買取、結局どこがいいの？`),
  LANDING_INTENT: cfg.landingIntent,
  RESEARCH_DATE: d(cfg.researchDate, "公式サイトでご確認ください"),
  GA4_ID: d(cfg.ga4Id, "G-DMCWVLP3E3"),
  ADS_ID: d(cfg.adsId, "AW-18129603657"),
  EV_PREFIX: d(cfg.evPrefix, "gold_kaitori"),
  CV_PRIMARY: d(cfg.cvPrimary, "gold_kaitori_affiliate_click"),
  CV_SECONDARY: d(cfg.cvSecondary, "gold_kaitori_other_click"),

  HERO_SRC: cfg.hero.src, HERO_ALT: esc(cfg.hero.alt),
  HERO_W: d(cfg.hero.width, 1823), HERO_H: d(cfg.hero.height, 863),
  TREND_IMG: d(cfg.trend?.src, cfg.hero.src), TREND_ALT: esc(d(cfg.trend?.alt, `${ITEM}の価格推移`)),
  MAP_IMG: d(cfg.map, "images/japan-map.webp"),
  FLOW_IMG: d(cfg.flow?.src, cfg.hero.src), FLOW_ALT: esc(d(cfg.flow?.alt, "申込から現金化までの流れ")),
  MEDIA_IMG: d(cfg.media?.img, cfg.hero.src), MEDIA_ALT: esc(d(cfg.media?.alt, "第三者メディアの検証")),
  MEDIA_BODY: d(cfg.media?.body, "▼書き換え：第三者メディアが相場と並べて検証した内容を、数字で書く。"),
  MEDIA_SOURCE: d(cfg.media?.source, "▼書き換え：引用元をリンク付きで"),

  P_NAME: P.name, P_URL: P.url, P_REL, P_KEY: d(P.key, "primary"),
  P_LABEL: d(P.label, "手取り重視なら"),
  P_BANNER: P.banner.src ?? P.banner, P_BANNER_ALT: esc(d(P.banner.alt, P.name)),
  P_LOGO: d(P.logo, ""), P_CAP: d(P.cap, ""),
  P_PHOTO: d(P.photo, cfg.hero.src),
  P_SHOP_URL: d(P.shopUrl, P.url),
  P_WHY: d(P.why, "▼書き換え：この社を「まず」にする理由を、数字と公式ソースで。"),
  P_STRENGTH_1: d(P.strengths?.[0], "▼書き換え"),
  P_STRENGTH_2: d(P.strengths?.[1], "▼書き換え"),
  P_STRENGTH_3: d(P.strengths?.[2], "▼書き換え"),
  P_CATEGORIES: listItems(P.categories),
  P_CERTS: listItems(P.certs),
  P_WEAKNESSES: listItems(d(P.weaknesses, ["▼書き換え：本物の弱みを3つ。ここを飾ると記事全体の信頼が落ちる"])),
  P_CAMP_TITLE: d(CAMP.title, `${P.name}のキャンペーン`),
  P_CAMP_BODY: d(CAMP.body, "▼書き換え：適用条件・上限・対象外を明記する。"),
  P_CAMP_IMG: d(CAMP.img, P.banner.src ?? P.banner),
  P_CAMP_ALT: esc(d(CAMP.alt, `${P.name} キャンペーン`)),
  P_CAMP_NOTE: d(CAMP.note, "※ 適用条件・上限額があります。申込時にご確認ください。"),
  P_CAMP_SHORT: d(CAMP.short, "キャンペーン中"),

  S_NAME: S.name, S_URL: S.url, S_REL, S_KEY: d(S.key, "secondary"),
  // 以下3つは出力先がJSの正規表現リテラル。ドットを1回だけエスケープする
  S_HOST_RE: reHost(S.host),
  P_AFF_RE: reHost(affHost),      // 主推薦社の成果リンク（アフィリ）のホスト。primary.url から自動判定
  P_SITE_RE: P.officialHost ? reHost(P.officialHost) : "(?!)",  // 公式直リンク。未指定なら決してマッチしない正規表現
  S_LABEL: d(S.label, "近くで査定なら"),
  S_BANNER: S.banner.src ?? S.banner, S_BANNER_ALT: esc(d(S.banner.alt, S.name)),
  S_LOGO: d(S.logo, ""), S_CAP: d(S.cap, ""),
  S_WHY: d(S.why, "▼書き換え：主推薦が使えないとき、なぜこの社なのかを数字で。"),
  S_STRENGTH_1: d(S.strengths?.[0], "▼書き換え"),
  S_STRENGTH_2: d(S.strengths?.[1], "▼書き換え"),
  S_STRENGTH_3: d(S.strengths?.[2], "▼書き換え"),
  S_CAUTIONS: listItems(d(S.cautions, ["▼書き換え：利用前に確認したいことを2〜3つ"])),
  S_SOURCES: d(S.sources, "▼書き換え：公式ページへのリンクを3本ほど"),

  CMP_COUNT: cfg.companies.length,
  CMP_HEAD, CMP_ROWS, COMPANY_ROWS, AREA_ITEMS, SHOP_ITEMS, REVIEWS,
  UNIT_LABEL: d(cfg.unitLabel, "1g単価"),
  FORMULA_1: d(cfg.formula?.[0], "当日の買取単価 × 品位 × 正味重量"),
  FORMULA_2: d(cfg.formula?.[1], "石・デザイン・ブランドの評価"),
  FORMULA_3: d(cfg.formula?.[2], "手数料"),
  DIFF_FACTORS: d(cfg.diffFactors, "買取単価・品質の判定・付加価値の評価・手数料"),
  CHECK_1: d(cfg.checks?.[0], "今日の<strong>単価</strong>と、どの品位で計算したか"),
  CHECK_2: d(cfg.checks?.[1], "<strong>重量</strong>と、差し引いた分があるか"),
  CHECK_3: d(cfg.checks?.[2], "<strong>デザイン・ブランド</strong>に、いくら価値を付けたか"),
  WHY_SOURCES: d(cfg.whySources, "▼書き換え：公式ページへのリンクを3本以上"),
  PUNCH_1: d(cfg.punches?.[0], "当日の基準価格 × 品位 × 重量<br>− 手数料<br>＝ あなたの手取り"),
  PUNCH_2: d(cfg.punches?.[1], "相場を知っていれば、<br>買い叩かれようがない。"),

  TIPS_SCAN, TIPS_BODY, STEPS, FAQ_HTML, FAQ_JSONLD, SUMMARY_ROWS, DISCLAIMER_ITEMS,
  BAD_SIGNS: listItems(d(cfg.badSigns, ["▼書き換え：危険信号を5つほど"])),
  CALC_HTML, CALC_SCRIPT, CAMPAIGN_SCRIPT, TAX_HTML,
};
ctaHeads.forEach((h, i) => { tokens[`CTA_BLOCK_${i + 1}`] = ctaBlock(h, i === ctaHeads.length - 1); });

/* ------------------------------------------------------------------ 生成 */
let s = readFileSync(`${TPL_DIR}/index.html`, "utf-8");
// ひな形の冒頭コメント（ひな形自身の使い方説明）は成果物に含めない
s = s.replace(/<!--\n  ={10,}[\s\S]*?={10,}\n-->\n/, "");

for (const [k, v] of Object.entries(tokens)) {
  s = s.split(`{{${k}}}`).join(String(v));
}
const left = [...new Set(s.match(/\{\{[A-Z0-9_]+\}\}/g) || [])];
if (left.length) die(`未置換のトークンが残っています: ${left.join(", ")}\n（新しいトークンをひな形に足したら、scripts/new-hikaku.mjs の tokens にも足す）`);

const dir = `public/${cfg.slug}`;
const out = `${dir}/index.html`;
if (existsSync(out) && !cfg.overwrite) die(`${out} は既にあります。上書きするには config に overwrite:true を指定してください。`);
mkdirSync(dir, { recursive: true });
writeFileSync(out, s, "utf-8");
if (!existsSync(`${dir}/style.css`) || cfg.overwrite) copyFileSync(`${TPL_DIR}/style.css`, `${dir}/style.css`);

/* ------------------------------------------------------------- 事後チェック */
const warn = [];
const imgs = [...new Set([...s.matchAll(/src="(images\/[^"]+)"/g)].map((m) => m[1]))];
const missing = imgs.filter((p) => !existsSync(`${dir}/${p}`));
if (missing.length) warn.push(`画像が未配置: ${missing.join(", ")}\n     → ${dir}/images/ に置く`);
if (!d(cfg.reviews, []).some((r) => r.bad)) warn.push("口コミに bad:true が1件もありません。良い声だけ並べると信頼が落ちます");
if (!d(cfg.companies, []).some((c) => c.candidate)) warn.push("companies に candidate:true の社がありません（比較表で推薦社が強調されません）");
const todo = (s.match(/▼書き換え/g) || []).length;   // 計算機スクリプト内の「▼」（下落記号）は数えない

console.log(`✅ 生成: ${out}`);
console.log(`   URL : ${SITE}/${cfg.slug}/`);
console.log(`   比較 : ${cfg.companies.length}社 ／ FAQ ${faq.length}問 ／ CTA ${ctaHeads.length}箇所 ／ 相場計算機 ${calc ? "あり" : "なし"}`);
if (warn.length) console.log("\n⚠ " + warn.join("\n⚠ "));
if (todo) console.log(`\n📝 「▼」が ${todo} 箇所あります。案件に合わせて全部書き直してください（残すと別商材の記述が混ざります）。`);
console.log(`\n次: npm run build → ブラウザで /${cfg.slug}/ を確認 → docs/比較記事LPの雛形.md の公開前チェックリストを通す`);
