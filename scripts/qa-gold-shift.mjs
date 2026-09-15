import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = "http://127.0.0.1:4321";
const outputDir = path.resolve("reports/gold-shift-lps/2026-09-13/qa");
const slugs = [
  "ring-hallmark",
  "inherited-jewelry",
  "parents-home-valuables",
  "decluttering-60s",
  "inheritance-jewelry-valuation",
  "safe-deposit-box-inheritance",
  "care-home-valuables"
];
const primaryWidths = [375, 390, 430];
const extraViewports = [
  { width: 320, height: 740 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const results = [];

async function inspect(slug, viewport, fullPage = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const url = `${base}/shift/${slug}?utm_source=qa&gclid=qa-click-id`;
  const response = await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const stickyInitiallyVisible = await page.locator("[data-sticky]").isVisible();
  await page.screenshot({ path: path.join(outputDir, `${slug}-${viewport.width}.png`), fullPage });

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const brokenImages = [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src);
    const ctas = [...document.querySelectorAll("[data-affiliate]")];
    const heroCta = document.querySelector(".shift-hero [data-inpage-cta]");
    const badCtas = ctas.filter((link) => !link.href.startsWith("https://ad-fam.com/ad/p/r?")).map((link) => link.outerHTML.slice(0, 180));
    const unclearExternalCtas = ctas.filter((link) => !link.querySelector("small")).map((link) => link.outerHTML.slice(0, 180));
    const clipped = [...document.querySelectorAll("h1,h2,h3,p,a,summary,li,dd,dt")].filter((el) => {
      const style = getComputedStyle(el);
      if (style.overflowX === "auto" || style.overflowX === "scroll") return false;
      return el.scrollWidth > el.clientWidth + 2;
    }).slice(0, 10).map((el) => `${el.tagName}.${el.className}`);
    const hero = document.querySelector(".shift-hero");
    const h1 = document.querySelector("h1");
    return {
      title: document.title,
      h1: document.querySelector("h1")?.innerText || "",
      rootOverflow: doc.scrollWidth > window.innerWidth + 1,
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      brokenImages,
      ctaCount: ctas.length,
      badCtas,
      unclearExternalCtas,
      heroCtaHref: heroCta?.getAttribute("href") || "",
      quickAnswerAffiliateCount: document.querySelectorAll("#answer [data-affiliate]").length,
      selectionPoints: document.querySelectorAll("#selection .criteria-grid li").length,
      clipped,
      heroBackground: hero ? getComputedStyle(hero, "::before").backgroundImage : "missing",
      bodyFont: getComputedStyle(document.body).fontFamily,
      h1Font: h1 ? getComputedStyle(h1).fontFamily : "missing",
      comparisonCards: document.querySelectorAll(".comparison-card").length,
      sourceLinks: document.querySelectorAll(".source-list a").length
    };
  });

  const secondFaq = page.locator(".faq-list details").nth(1);
  await secondFaq.locator("summary").focus();
  await page.keyboard.press("Enter");
  const faqOpened = await secondFaq.evaluate((el) => el.open);

  await page.locator("#answer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(160);
  await page.locator("#appraisal").scrollIntoViewIfNeeded();
  await page.waitForTimeout(220);
  const stickyVisibleAfterBridge = await page.locator("[data-sticky]").isVisible();
  await page.locator("#comparison").scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  await page.locator("#manekiya").scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);

  const affiliateCta = page.locator("[data-affiliate]").first();
  await affiliateCta.evaluate((link) => link.addEventListener("click", (event) => event.preventDefault(), { once: true }));
  await affiliateCta.click();
  await page.waitForTimeout(80);

  const funnelPayloads = await page.evaluate(() => (window.dataLayer || [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item) && item.event)
    .map((item) => ({ ...item })));
  const funnelEvents = funnelPayloads.map((item) => item.event);

  const record = {
    slug,
    viewport,
    status: response?.status() || null,
    faqOpened,
    stickyInitiallyVisible,
    stickyVisibleAfterBridge,
    funnelEvents,
    funnelPayloads,
    ...metrics
  };
  results.push(record);
  await page.close();
}

for (const slug of slugs) {
  for (const width of primaryWidths) await inspect(slug, { width, height: 844 }, width === 375);
}

for (const viewport of extraViewports) await inspect("ring-hallmark", viewport, true);

await browser.close();
await fs.writeFile(path.join(outputDir, "results.json"), JSON.stringify(results, null, 2), "utf8");

const requiredEvents = ["quick_answer_view", "bridge_view", "comparison_view", "manekiya_view", "affiliate_click"];
const failures = results.filter((row) => row.status !== 200
  || row.rootOverflow
  || row.brokenImages.length
  || row.badCtas.length
  || row.unclearExternalCtas.length
  || row.clipped.length
  || !row.faqOpened
  || row.stickyInitiallyVisible
  || !row.stickyVisibleAfterBridge
  || row.comparisonCards !== 3
  || row.ctaCount !== 5
  || !row.heroCtaHref.startsWith("#")
  || row.quickAnswerAffiliateCount !== 0
  || row.selectionPoints !== 3
  || requiredEvents.some((event) => !row.funnelEvents.includes(event))
  || requiredEvents.some((event) => {
    const payload = row.funnelPayloads.find((item) => item.event === event);
    return !payload?.slug || !payload?.intent_group || !payload?.primary_keyword;
  })
  || ["cta_position", "cta_text"].some((key) => !row.funnelPayloads.find((item) => item.event === "affiliate_click")?.[key])
  || !row.heroBackground.includes("webp"));

console.log(JSON.stringify({ checks: results.length, failures: failures.length, failureDetails: failures }, null, 2));
if (failures.length) process.exit(1);
