/**
 * ブラウザ版エンジンを docs/golden-cases.json で検証する。
 * Python版（backend/tests/test_golden.py）と同じ正解表を読むので、
 * 両方が通れば数式は一致している。
 *
 *   node tools/ppc-affiliate-os/tests-js/run.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  betainc,
  betaCredibleInterval,
  zeroEventProbability,
  clicksToRuleOutRate,
  calculatePreflight,
  evaluateRuntime,
  scoreKeyword,
  scoreKeywords,
  aggregateClusters,
  normalizeKeyword,
} from '../../../public/tools/ppc/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, '..', 'docs', 'golden-cases.json'), 'utf8'));
const TOL = golden.tolerance ?? 1e-6;

function assertClose(actual, expected, label) {
  if (typeof expected === 'string') {
    assert.equal(actual, expected, label);
    return;
  }
  const delta = Math.max(TOL, Math.abs(expected) * 1e-5);
  assert.ok(
    Math.abs(actual - expected) <= delta,
    `${label}: expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`
  );
}

test('統計関数が既知の値と一致する', () => {
  for (const x of [0.1, 0.35, 0.5, 0.9]) assertClose(betainc(1, 1, x), x, `I_${x}(1,1)`);
  for (const x of [0.2, 0.6, 0.95]) assertClose(betainc(2, 1, x), x * x, `I_${x}(2,1)`);
  assertClose(zeroEventProbability(10, 0.1), 0.9 ** 10, 'zero prob');
  assertClose(clicksToRuleOutRate(0.05, 0.05), Math.log(0.05) / Math.log(0.95), 'clicks needed');
  const [lo, hi] = betaCredibleInterval(5, 55, 0.8);
  assert.ok(lo < 5 / 55 && hi > 5 / 55, '信用区間が点推定を挟む');
  assert.deepEqual(betaCredibleInterval(0, 0), [0, 1], '試行0なら完全に不確実');
});

test('正規化がゆらぎを吸収する', () => {
  assert.equal(normalizeKeyword('ＲＯＬＥＸ　買取'), 'rolex 買取');
  assert.equal(normalizeKeyword('  時計   買取  '), '時計 買取');
});

for (const c of golden.preflight) {
  test(`preflight: ${c.name}`, () => {
    const result = calculatePreflight(c.input);
    for (const [key, expected] of Object.entries(c.expect)) {
      assertClose(result[key], expected, `${c.name} / ${key}`);
    }
  });
}

for (const c of golden.runtime) {
  test(`runtime: ${c.name}`, () => {
    const result = evaluateRuntime(c.input);
    for (const [key, expected] of Object.entries(c.expect)) {
      let actual;
      if (key === 'improvement_required_gap') actual = result.improvement.required_gap;
      else if (key === 'zero_cv_required_affiliate_cvr') actual = result.evidence.zero_cv.required_affiliate_cvr;
      else actual = result[key];
      assertClose(actual, expected, `${c.name} / ${key}`);
    }
  });
}

for (const c of golden.keyword) {
  test(`keyword: ${c.name}`, () => {
    const result = scoreKeyword(c.input, c.offer);
    for (const [key, expected] of Object.entries(c.expect)) {
      assertClose(result[key], expected, `${c.name} / ${key}`);
    }
  });
}

test('クラスタ集計がロングテールを束ねる', () => {
  const offer = { payout: 8500, approval_rate: 1.0, advertiser_cvr: 0.08, target_roas: 1.5 };
  const keywords = [];
  for (let i = 0; i < 12; i += 1) {
    keywords.push({
      keyword: `運送業 資金繰り ${i}`, avg_monthly_searches: 10, forecast_cpc: 100,
      commercial_intent: 75, estimated_lp_ctr: 0.5, ai_confidence: 0.7,
      cluster: '運送業資金不足',
    });
  }
  keywords.push({
    keyword: '腕時計', avg_monthly_searches: 90000, forecast_cpc: 600,
    commercial_intent: 20, estimated_lp_ctr: 0.2, cluster: '一般語',
  });
  const clusters = aggregateClusters(scoreKeywords(keywords, offer));
  assert.equal(clusters[0].cluster, '運送業資金不足');
  assert.equal(clusters[0].keyword_count, 12);
  assert.ok(clusters[0].expected_monthly_profit > 0);
});

test('無効な入力は例外になる', () => {
  assert.throws(() =>
    calculatePreflight({
      payout: 1000, approval_rate: 1.5, advertiser_cvr: 0.1,
      target_roas: 1.5, market_cpc: 100, estimated_lp_ctr: 0.5,
    })
  );
  assert.throws(() =>
    evaluateRuntime({
      impressions: 0, clicks: -1, cost: 0, affiliate_clicks: 0, conversions: 0,
      conversion_value: 0, approval_rate: 1, target_roas: 1.5,
      max_test_budget: 0, min_test_clicks: 0, stop_after_zero_cv_clicks: 0,
    })
  );
});
