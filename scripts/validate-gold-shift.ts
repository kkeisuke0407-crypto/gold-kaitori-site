import fs from "node:fs";
import path from "node:path";
import { goldShiftPages } from "../src/data/goldShiftPages";
import { goldComparisonCompanies } from "../src/data/goldComparison";

const root = process.cwd();
const failures: string[] = [];
const slugs = new Set<string>();
const intentGroups = new Set<string>();

if (goldShiftPages.length !== 7) failures.push(`expected 7 pages, got ${goldShiftPages.length}`);
if (goldComparisonCompanies.length !== 3) failures.push(`expected 3 companies, got ${goldComparisonCompanies.length}`);

for (const page of goldShiftPages) {
  if (slugs.has(page.slug)) failures.push(`duplicate slug: ${page.slug}`);
  if (intentGroups.has(page.intentGroup)) failures.push(`duplicate intent group: ${page.intentGroup}`);
  slugs.add(page.slug);
  intentGroups.add(page.intentGroup);

  const hero = path.join(root, "public", page.hero.backgroundImage.replace(/^\//, ""));
  if (!fs.existsSync(hero)) failures.push(`missing hero: ${hero}`);
  if (!page.quickAnswer.answer || page.sections.length < 3) failures.push(`incomplete script: ${page.slug}`);
  if (!page.quickAnswer.discovery?.title) failures.push(`missing discovery hook: ${page.slug}`);
  if (!page.hero.ctaAnchor?.startsWith("#")) failures.push(`hero CTA is not an in-page anchor: ${page.slug}`);
  if (page.selectionGuide?.points.length !== 3) failures.push(`selection guide must have 3 points: ${page.slug}`);
  if (!page.ctaLabels || Object.values(page.ctaLabels).some((label) => !label)) failures.push(`missing contextual CTA label: ${page.slug}`);
  if (!page.manekiyaReason) failures.push(`missing Manekiya ranking reason: ${page.slug}`);
  if (page.faqs.length < 4) failures.push(`not enough FAQs: ${page.slug}`);
  if (!page.sources.length || page.sources.some((source) => !source.url.startsWith("https://"))) failures.push(`invalid sources: ${page.slug}`);
}

const expected = ["AG01", "AG02", "AG03", "AG04", "AG05", "AG06", "AG07"];
for (const group of expected) if (!intentGroups.has(group)) failures.push(`missing intent group: ${group}`);

const safeDepositPage = goldShiftPages.find((page) => page.intentGroup === "AG06");
if (safeDepositPage?.secondaryKeywords.includes("貸金庫 解約")) failures.push("AG06 must not target the general keyword 貸金庫 解約");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`gold-shift validation: PASS (${goldShiftPages.length} pages, ${goldComparisonCompanies.length} companies)`);
