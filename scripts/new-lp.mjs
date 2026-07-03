#!/usr/bin/env node
/*
 * 新しいLPを「ひな形（金=LP3 / プラチナ=LP2nd）」から一発生成する。
 *
 *   使い方:  node scripts/new-lp.mjs scripts/lp-configs/<name>.config.mjs
 *   または:  npm run new-lp -- scripts/lp-configs/<name>.config.mjs
 *
 * 設定ファイル（config）に「検索意図ごとに変わる部分」だけを書けば、
 * それ以外（構造・CSS・比較表・キャンペーン日付ロジック・CTA計測・相見積もり等）は
 * ひな形からそのままコピーされる。＝ ひな形と構造が完全一致した新LPができる。
 *
 * 変更できるスロット（config のキー）:
 *   base           "gold"(LP3) | "platinum"(LP2nd)   … 必須
 *   slug           URLパス（例 "k18-ring-20g"）        … 必須（src/pages/<slug>/ に生成）
 *   title          <title> / og:title                 … 必須
 *   desc           meta description / og:description   … 必須
 *   landingIntent  <body data-landing-intent>          … 必須（例 "lp_k18ring20g"）
 *   hero           { src, alt, width?, height? }       … 必須（FVヒーロー画像）
 *   ogpImage       og:image のURL                       … 任意（省略時はひな形の値）
 *   refTtl         「あなたの◯◯、今ならいくら？」        … 任意（省略時はひな形の値）
 *   faq            [{ q, a }, ...]                     … 任意（省略時はひな形のFAQ）
 *   overwrite      true で既存ファイルを上書き            … 任意
 *
 * ※ faq の答え(a)に {yen(rates.k18)} 等の動的表示を入れたい場合は、生成後にその項目だけ
 *   手で調整してください（schema用テキストとは書式が異なるため）。基本は素のテキスト推奨。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SITE = "https://kaitori.hakobu-family.com";
const TEMPLATES = { gold: "src/pages/LP3/index.astro", platinum: "src/pages/LP2nd/index.astro" };

const configArg = process.argv[2];
if (!configArg) {
  console.error("使い方: node scripts/new-lp.mjs <config.mjs>\n例: node scripts/new-lp.mjs scripts/lp-configs/_example.config.mjs");
  process.exit(1);
}
const cfg = (await import(pathToFileURL(resolve(configArg)).href)).default;

// --- バリデーション ---
for (const k of ["base", "slug", "title", "desc", "landingIntent", "hero"]) {
  if (!cfg[k]) { console.error(`config に必須項目がありません: ${k}`); process.exit(1); }
}
if (!TEMPLATES[cfg.base]) { console.error(`base は "gold" か "platinum" を指定してください（今: ${cfg.base}）`); process.exit(1); }
if (!cfg.hero.src || !cfg.hero.alt) { console.error("hero.src と hero.alt は必須です"); process.exit(1); }
if (!/^[a-z0-9-]+$/.test(cfg.slug)) { console.error(`slug は英小文字・数字・ハイフンのみ: ${cfg.slug}`); process.exit(1); }

let s = readFileSync(TEMPLATES[cfg.base], "utf-8");
const applied = [];
function sub(re, rep, label) {
  if (!re.test(s)) { console.error(`ひな形にアンカーが見つかりません: ${label}`); process.exit(1); }
  s = s.replace(re, () => rep); applied.push(label);
}

// メタ情報
sub(/const PAGE_TITLE = "[^"]*";/, `const PAGE_TITLE = ${JSON.stringify(cfg.title)};`, "title");
sub(/const PAGE_DESC = "[^"]*";/, `const PAGE_DESC = ${JSON.stringify(cfg.desc)};`, "desc");
sub(/const CANONICAL = "[^"]*";/, `const CANONICAL = "${SITE}/${cfg.slug}/";`, "canonical");
if (cfg.ogpImage) sub(/const OGP_IMAGE = "[^"]*";/, `const OGP_IMAGE = ${JSON.stringify(cfg.ogpImage)};`, "ogp");

// data-landing-intent
sub(/<body data-landing-intent="[^"]*"/, `<body data-landing-intent="${cfg.landingIntent}"`, "landingIntent");

// FVヒーロー画像
const w = cfg.hero.width || 1672, h = cfg.hero.height || 941;
sub(/<img src="\/images\/[^"]*"[^>]*class="fv-hero-img"\s*\/>/,
  `<img src="${cfg.hero.src}" alt="${cfg.hero.alt}" width="${w}" height="${h}" loading="eager" fetchpriority="high" decoding="async" class="fv-hero-img" />`,
  "hero");

// ref-ttl（任意）
if (cfg.refTtl) {
  if (!/ref-ttl">[^<]*</.test(s)) { console.error("ひな形に ref-ttl が見つかりません"); process.exit(1); }
  s = s.replace(/ref-ttl">[^<]*</, `ref-ttl">${cfg.refTtl}<`); applied.push("refTtl");
}

// FAQ（任意）: schema(faqJsonLd) と 表示FAQ の両方を再生成
if (Array.isArray(cfg.faq) && cfg.faq.length) {
  for (const item of cfg.faq) if (!item.q || !item.a) { console.error("faq の各項目は { q, a } が必要です"); process.exit(1); }
  const entries = cfg.faq.map(({ q, a }) => `    [${JSON.stringify(q)}, ${JSON.stringify(a)}],`).join("\n");
  const faqBlock =
`const faqJsonLd = {
  "@context": "https://schema.org", "@type": "FAQPage",
  "mainEntity": [
${entries}
  ].map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
};`;
  const bs = s.indexOf("const faqJsonLd = {");
  if (bs < 0) { console.error("ひな形に faqJsonLd が見つかりません"); process.exit(1); }
  s = s.slice(0, bs) + faqBlock + s.slice(s.indexOf("\n};", bs) + 3);
  applied.push("faqJsonLd");

  const details = cfg.faq.map(({ q, a }, i) => `          <details${i === 0 ? " open" : ""}><summary>${q}</summary><p>${a}</p></details>`).join("\n");
  const faqDiv = `<div class="faq">\n${details}\n        </div>`;
  if (!/<div class="faq">[\s\S]*?<\/div>/.test(s)) { console.error("ひな形に表示FAQ(<div class=\"faq\">) が見つかりません"); process.exit(1); }
  s = s.replace(/<div class="faq">[\s\S]*?<\/div>/, () => faqDiv);
  applied.push("faqVisible");
}

// 書き出し
const dir = `src/pages/${cfg.slug}`;
const out = `${dir}/index.astro`;
if (existsSync(out) && !cfg.overwrite) {
  console.error(`${out} は既に存在します。上書きするには config に overwrite:true を指定してください。`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(out, s, "utf-8");

console.log(`✅ 生成: ${out}`);
console.log(`   ひな形: ${cfg.base === "gold" ? "LP3(金)" : "LP2nd(プラチナ)"}  /  URL: ${SITE}/${cfg.slug}/`);
console.log(`   差し替えたスロット: ${applied.join(", ")}`);
console.log(`   次: npm run build で確認（FV画像 ${cfg.hero.src} をpublic/images/ に置くのを忘れずに）`);
