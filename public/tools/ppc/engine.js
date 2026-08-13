/**
 * PPC Affiliate OS — 意思決定エンジン（ブラウザ版）
 *
 * backend/app/domain/*.py の移植。両実装は tools/ppc-affiliate-os/docs/golden-cases.json
 * という共通の正解表で検証されており、数式がズレたらテストが落ちる。
 *   Python : backend/tests/test_golden.py
 *   JS     : tools/ppc-affiliate-os/tests-js/run.mjs
 *
 * これにより、サーバを立てなくてもブラウザだけで同じ判定ができる。
 * 依存ゼロ・ビルド不要（そのままGitHub Pagesで動く）。
 */

// ============================================================ 統計

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function betacf(a, b, x, maxIter = 300, eps = 1e-12) {
  const tiny = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return h;
}

/** 正則化不完全ベータ関数 I_x(a,b) = Beta(a,b) のCDF */
export function betainc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(a * Math.log(x) + b * Math.log1p(-x) - logBeta(a, b));
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
  return (
    1 -
    (Math.exp(b * Math.log1p(-x) + a * Math.log(x) - logBeta(a, b)) *
      betacf(b, a, 1 - x)) /
      b
  );
}

/** Beta(a,b) の分位点（二分法） */
export function betaPpf(a, b, q) {
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (betainc(a, b, mid) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 成功率のベイズ信用区間。事前分布は Beta(1,1)。 */
export function betaCredibleInterval(successes, trials, level = 0.8) {
  if (trials <= 0) return [0, 1];
  const s = Math.max(0, Math.min(successes, trials));
  const a = 1 + s;
  const b = 1 + (trials - s);
  const tail = (1 - level) / 2;
  return [betaPpf(a, b, tail), betaPpf(a, b, 1 - tail)];
}

/** 真の発生率 rate のとき trials 回で0件になる確率 */
export function zeroEventProbability(trials, rate) {
  if (trials <= 0) return 1;
  if (rate <= 0) return 1;
  if (rate >= 1) return 0;
  return Math.exp(trials * Math.log1p(-rate));
}

/** 発生率 rate を有意水準 alpha で棄却するのに必要な試行数（0件前提） */
export function clicksToRuleOutRate(rate, alpha = 0.05) {
  if (rate <= 0 || rate >= 1) return Infinity;
  return Math.log(alpha) / Math.log1p(-rate);
}

// ============================================================ ユーティリティ

export function safeDiv(n, d) {
  return d ? n / d : 0;
}

function round(x, n) {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** n;
  return Math.round((x + Number.EPSILON) * f) / f;
}

// ============================================================ 採算計算

const MAX_CVR_SWING = 0.5;

export function computeEconomics({
  payout, approvalRate, advertiserCvr, targetRoas, marketCpc, lpCtr,
  expectedMonthlyClicks = 0,
}) {
  const affiliateClickEpc = payout * approvalRate * advertiserCvr;
  const adClickEpc = affiliateClickEpc * lpCtr;
  const targetCpc = safeDiv(adClickEpc, targetRoas);
  const requiredLpCtr = safeDiv(marketCpc * targetRoas, affiliateClickEpc);
  return {
    advertiser_cvr: advertiserCvr,
    affiliate_click_epc: affiliateClickEpc,
    ad_click_epc: adClickEpc,
    break_even_cpc: adClickEpc,
    target_cpc: targetCpc,
    required_lp_ctr: requiredLpCtr,
    cpc_headroom: safeDiv(targetCpc, marketCpc),
    monthly_profit_potential: expectedMonthlyClicks * (adClickEpc - marketCpc),
  };
}

function roundEconomics(e) {
  const out = {};
  for (const [k, v] of Object.entries(e)) out[k] = round(v, 6);
  return out;
}

/** 出稿前判定。基準/弱気/強気の3シナリオを出し、弱気基準でGOを決める。 */
export function calculatePreflight(input) {
  const {
    payout, approval_rate: approvalRate, advertiser_cvr: advertiserCvr,
    target_roas: targetRoas, market_cpc: marketCpc,
    estimated_lp_ctr: estimatedLpCtr,
    advertiser_cvr_confidence: confidence = 1.0,
    expected_monthly_clicks: expectedMonthlyClicks = 0,
  } = input;

  if (!(targetRoas > 0)) throw new Error('target_roas must be > 0');
  for (const [name, v] of [
    ['approval_rate', approvalRate], ['advertiser_cvr', advertiserCvr],
    ['estimated_lp_ctr', estimatedLpCtr], ['advertiser_cvr_confidence', confidence],
  ]) {
    if (!(v >= 0 && v <= 1)) throw new Error(`${name} must be between 0 and 1`);
  }
  if (payout < 0 || marketCpc < 0) throw new Error('payout / market_cpc must be >= 0');

  const swing = (1 - confidence) * MAX_CVR_SWING;
  const shared = { payout, approvalRate, targetRoas, marketCpc, lpCtr: estimatedLpCtr, expectedMonthlyClicks };
  const base = computeEconomics({ ...shared, advertiserCvr });
  const downside = computeEconomics({ ...shared, advertiserCvr: Math.max(0, advertiserCvr * (1 - swing)) });
  const upside = computeEconomics({ ...shared, advertiserCvr: Math.min(1, advertiserCvr * (1 + swing)) });

  const reasons = [];
  const notes = [];
  let decision;

  if (base.affiliate_click_epc <= 0) {
    decision = 'STOP';
    reasons.push('ZERO_EXPECTED_VALUE');
    notes.push('成果単価・承認率・広告主CVRのいずれかが0。採算は構造的に成立しない。');
  } else if (base.required_lp_ctr > 1) {
    decision = 'STOP';
    reasons.push('REQUIRED_LP_CTR_OVER_100');
    notes.push(
      `必要LP→アフィCTRが${(base.required_lp_ctr * 100).toFixed(1)}%。100%を超えるため、どんなLPでも目標ROASに到達しない。`
    );
  } else if (downside.cpc_headroom >= 1.3) {
    decision = 'GO';
    reasons.push('STRONG_CPC_HEADROOM');
    notes.push('弱気シナリオでもCPC余裕率1.3倍以上。優先的に出稿してよい。');
  } else if (downside.cpc_headroom >= 1.0) {
    decision = 'GO';
    reasons.push('POSITIVE_CPC_HEADROOM');
    notes.push('弱気シナリオでも損益分岐を上回る。テスト予算を通常配分でよい。');
  } else if (base.cpc_headroom >= 1.0) {
    decision = 'TEST';
    reasons.push('BASE_OK_DOWNSIDE_RISK');
    notes.push('基準シナリオでは黒字だが、広告主CVRが想定より低いと赤字化する。少額テストで実CVRを確定させてから増額する。');
  } else if (base.cpc_headroom >= 0.8) {
    decision = 'TEST';
    reasons.push('IMPROVEMENT_REQUIRED');
    notes.push(
      `必要LP CTR ${(base.required_lp_ctr * 100).toFixed(1)}% に対し想定 ${(estimatedLpCtr * 100).toFixed(1)}%。LP改善前提でのテストなら成立余地あり。`
    );
  } else {
    decision = 'STOP';
    reasons.push('STRUCTURAL_CPC_GAP');
    notes.push(
      `CPC余裕率${base.cpc_headroom.toFixed(2)}。市場CPCと上限CPCの差が大きく、LP改善だけでは埋まらない。`
    );
  }

  if (confidence < 1) reasons.push('CVR_ESTIMATE_UNCERTAIN');

  return {
    affiliate_click_epc: round(base.affiliate_click_epc, 4),
    ad_click_epc: round(base.ad_click_epc, 4),
    break_even_cpc: round(base.break_even_cpc, 4),
    target_cpc: round(base.target_cpc, 4),
    required_lp_ctr: round(base.required_lp_ctr, 6),
    cpc_headroom: round(base.cpc_headroom, 6),
    monthly_profit_potential: round(base.monthly_profit_potential, 2),
    decision,
    reason_codes: reasons,
    base: roundEconomics(base),
    downside: roundEconomics(downside),
    upside: roundEconomics(upside),
    notes,
  };
}

// ============================================================ ボトルネック

export const DEFAULT_BENCHMARKS = {
  ad_ctr: 0.05,
  lp_to_affiliate_ctr: 0.35,
  affiliate_cvr: 0.05,
};

export function diagnoseBottlenecks(m, benchmarks = DEFAULT_BENCHMARKS) {
  const {
    adCtr, lpCtr, affiliateCvr, actualRoas, expectedApprovedRoas,
    targetRoas, clicks, affiliateClicks, conversions,
  } = m;

  if (clicks === 0) {
    return [{
      code: 'NO_TRAFFIC', label: '配信量', current: 0, benchmark: 0,
      uplift: 0, gap_closed_ratio: 0, pattern: '-',
      message: 'クリックが0。入札・予算・審査状況を確認する。',
    }];
  }

  const gap = expectedApprovedRoas > 0 ? safeDiv(targetRoas, expectedApprovedRoas) : Infinity;
  const levers = [
    ['AD_CTR', '広告CTR', adCtr, benchmarks.ad_ctr, 'A',
      'KWと広告文の関連性・検索意図のズレ。広告見出しをKWクラスタに寄せる。'],
    ['LP_TO_AFFILIATE_CTR', 'LP→アフィCTR', lpCtr, benchmarks.lp_to_affiliate_ctr, 'B',
      'FV・CTA・比較軸がLPの検索意図と噛み合っていない可能性が高い。'],
    ['AFFILIATE_CVR', 'アフィCVR', affiliateCvr, benchmarks.affiliate_cvr, 'C',
      '遷移前後の期待値ズレ。検索語句の質と広告主LPとの整合を見る。'],
  ];

  const found = [];
  for (const [code, label, current, bench, pattern, message] of levers) {
    if (current >= bench) continue;
    const uplift = current > 0 ? safeDiv(bench, current) : Infinity;
    let ratio;
    if (gap === Infinity) ratio = 0;
    else if (uplift === Infinity) ratio = 1;
    else ratio = gap > 1 ? Math.min(uplift, gap) / gap : 1;
    found.push({
      code, label, current: round(current, 6), benchmark: bench,
      uplift: uplift === Infinity ? -1 : round(uplift, 4),
      gap_closed_ratio: round(ratio, 4), pattern, message,
    });
  }

  if (found.length === 0 && expectedApprovedRoas < targetRoas) {
    found.push({
      code: 'CPC_OR_PAYOUT_ECONOMICS', label: 'CPC/成果単価',
      current: round(expectedApprovedRoas, 6), benchmark: targetRoas,
      uplift: gap === Infinity ? -1 : round(gap, 4), gap_closed_ratio: 1, pattern: 'D',
      message: 'ファネル各段は健全。CPCが高すぎるか成果単価が不足している。入札上限を下げて再計算する。',
    });
  }

  if (actualRoas >= targetRoas && targetRoas > expectedApprovedRoas) {
    found.push({
      code: 'APPROVAL_RATE', label: '承認率',
      current: round(safeDiv(expectedApprovedRoas, actualRoas), 6),
      benchmark: round(safeDiv(targetRoas, actualRoas), 6),
      uplift: round(safeDiv(targetRoas, expectedApprovedRoas), 4),
      gap_closed_ratio: 1, pattern: 'E',
      message: '発生成果は足りているが承認後に赤字。成果条件とのミスマッチ、ユーザー属性を疑う。',
    });
  }

  if (conversions === 0 && affiliateClicks > 0) {
    found.push({
      code: 'ZERO_CONVERSION', label: '成果発生', current: 0,
      benchmark: benchmarks.affiliate_cvr, uplift: -1, gap_closed_ratio: 1, pattern: 'C',
      message: 'アフィクリックは出ているが成果0。計測連携（gclid引き継ぎ）とLP先の整合を先に確認する。',
    });
  }

  found.sort((a, b) => {
    if (b.gap_closed_ratio !== a.gap_closed_ratio) return b.gap_closed_ratio - a.gap_closed_ratio;
    return (b.uplift > 0 ? b.uplift : 99) - (a.uplift > 0 ? a.uplift : 99);
  });
  return found;
}

// ============================================================ 最小改善経路

const TOLERANCE = { cpc: 0.25, lp_to_affiliate_ctr: 0.5, affiliate_cvr: 0.25, ad_ctr: 0.6 };
const LEVER_LABEL = { cpc: 'CPC', lp_to_affiliate_ctr: 'LP→アフィCTR', affiliate_cvr: 'アフィCVR', ad_ctr: '広告CTR' };
const CONTROLLABLE = { cpc: true, lp_to_affiliate_ctr: true, affiliate_cvr: false, ad_ctr: true };

function feasibility(relativeChange, tolerance) {
  if (relativeChange <= 0) return 100;
  const r = relativeChange / tolerance;
  return round(100 / (1 + r * r), 1);
}

function evidenceLevel(clicks, conversions) {
  return round(0.5 * Math.min(1, clicks / 300) + 0.5 * Math.min(1, conversions / 5), 4);
}

export function buildImprovementPlan({
  targetRoas, expectedApprovedRoas, actualCpc, lpCtr, affiliateCvr, adCtr,
  clicks, conversions, marketCpcFloor = null,
}) {
  const notes = [];
  const evidence = evidenceLevel(clicks, conversions);

  if (expectedApprovedRoas <= 0) {
    return {
      required_gap: Infinity, reachable: false, feasibility_score: 0,
      evidence_level: evidence, best_path: null, paths: [], levers: [],
      notes: ['成果が0のため改善倍率を計算できない。まず1件の成果を出せるかを見る。'],
    };
  }

  const gap = safeDiv(targetRoas, expectedApprovedRoas);
  if (gap <= 1) {
    return {
      required_gap: round(gap, 4), reachable: true, feasibility_score: 100,
      evidence_level: evidence, best_path: null, paths: [], levers: [],
      notes: ['すでに目標ROASを満たしている。改善経路の算出は不要。'],
    };
  }

  const raw = { cpc: actualCpc, lp_to_affiliate_ctr: lpCtr, affiliate_cvr: affiliateCvr, ad_ctr: adCtr };

  const makeLever = (key, factor) => {
    const current = raw[key];
    if (!(current > 0)) return null;
    let required;
    let change;
    let direction;
    if (key === 'cpc') {
      required = current / factor;
      change = 1 - safeDiv(required, current);
      direction = 'down';
    } else {
      required = current * factor;
      if (required > 1) {
        return {
          key, label: LEVER_LABEL[key], current: round(current, 6),
          required: round(required, 6), change_ratio: round(factor - 1, 6),
          direction: 'up', feasibility: 0, controllable: CONTROLLABLE[key],
        };
      }
      change = factor - 1;
      direction = 'up';
    }
    let f = feasibility(Math.abs(change), TOLERANCE[key]);
    if (key === 'cpc' && marketCpcFloor && required < marketCpcFloor) f = Math.min(f, 5);
    return {
      key, label: LEVER_LABEL[key], current: round(current, 6),
      required: round(required, 6), change_ratio: round(Math.abs(change), 6),
      direction, feasibility: f, controllable: CONTROLLABLE[key],
    };
  };

  const singleLevers = Object.keys(raw).map((k) => makeLever(k, gap)).filter(Boolean);
  const paths = singleLevers.map((lv) => ({
    name: `${lv.label}単独`,
    levers: [lv],
    feasibility: lv.feasibility,
    description:
      `${lv.label}を${lv.current}→${lv.required}` +
      `（${(lv.change_ratio * 100).toFixed(1)}%${lv.direction === 'down' ? '削減' : '改善'}）`,
  }));

  const controllableKeys = ['cpc', 'lp_to_affiliate_ctr', 'ad_ctr'].filter((k) => raw[k] > 0);
  for (const size of [2, 3]) {
    if (controllableKeys.length < size) continue;
    const keys = controllableKeys.slice(0, size);
    const factor = gap ** (1 / size);
    const combo = keys.map((k) => makeLever(k, factor));
    if (combo.some((lv) => !lv)) continue;
    paths.push({
      name: `${combo.map((lv) => lv.label).join(' + ')}（同時改善）`,
      levers: combo,
      feasibility: round(Math.min(...combo.map((lv) => lv.feasibility)), 1),
      description: combo
        .map((lv) => `${lv.label} ${(lv.change_ratio * 100).toFixed(1)}%${lv.direction === 'down' ? '削減' : '改善'}`)
        .join('／'),
    });
  }

  paths.sort((a, b) => b.feasibility - a.feasibility);
  const best = paths[0] || null;
  let score = 0;
  if (!best) {
    notes.push('有効な改善レバーが見つからない。構造的に赤字の可能性が高い。');
  } else {
    score = round(best.feasibility * (0.6 + 0.4 * evidence), 1);
    if (evidence < 0.5) notes.push('データ量が不足しているため、実現性スコアは暫定値。テストを継続して再評価する。');
    if (best.feasibility < 20) notes.push('最も現実的な経路でも要求改善幅が大きい。撤退を第一候補に置くべき水準。');
  }

  if (best && best.levers.length && best.levers[0].controllable === false) {
    notes.push('最有力レバーが広告主側の指標。自分では直接動かせないため、KW品質の入替で間接的に狙う。');
  }

  return {
    required_gap: round(gap, 4),
    reachable: Boolean(best && best.feasibility > 0),
    feasibility_score: score,
    evidence_level: evidence,
    best_path: best,
    paths,
    levers: singleLevers,
    notes,
  };
}

// ============================================================ 運用判定

function zeroCvEvidence(d, affiliateClicks) {
  const out = { applicable: false };
  if (d.conversions > 0 || !d.payout || d.payout <= 0) return out;
  if (affiliateClicks <= 0 || d.cost <= 0) return out;

  const revenuePerCv = d.payout * d.approval_rate;
  if (revenuePerCv <= 0) return out;
  const requiredConversions = (d.cost * d.target_roas) / revenuePerCv;
  const requiredCvr = requiredConversions / affiliateClicks;
  if (requiredCvr >= 1) {
    return {
      applicable: true, required_affiliate_cvr: round(requiredCvr, 6),
      p_zero_given_required: 0, significant: true, clicks_needed: 0,
    };
  }
  const alpha = d.zero_cv_alpha ?? 0.05;
  const pZero = zeroEventProbability(affiliateClicks, requiredCvr);
  return {
    applicable: true,
    required_affiliate_cvr: round(requiredCvr, 6),
    p_zero_given_required: round(pZero, 6),
    significant: pZero < alpha,
    clicks_needed: round(clicksToRuleOutRate(requiredCvr, alpha), 1),
  };
}

/** 運用中の診断とSCALE/KEEP/IMPROVE/TEST/STOP判定 */
export function evaluateRuntime(input) {
  const d = {
    scale_roas_multiplier: 1.2,
    minimum_scale_conversions: 3,
    credible_level: 0.8,
    zero_cv_alpha: 0.05,
    payout: null,
    market_cpc_floor: null,
    ...input,
  };

  if (d.impressions < 0 || d.clicks < 0 || d.affiliate_clicks < 0) throw new Error('counts must be >= 0');
  if (d.cost < 0 || d.conversions < 0 || d.conversion_value < 0) throw new Error('cost/conversions/value must be >= 0');
  if (!(d.approval_rate >= 0 && d.approval_rate <= 1)) throw new Error('approval_rate must be between 0 and 1');
  if (!(d.target_roas > 0)) throw new Error('target_roas must be > 0');

  const adCtr = safeDiv(d.clicks, d.impressions);
  const actualCpc = safeDiv(d.cost, d.clicks);
  const lpCtr = safeDiv(d.affiliate_clicks, d.clicks);
  const affiliateCvr = safeDiv(d.conversions, d.affiliate_clicks);
  const adToFinalCvr = safeDiv(d.conversions, d.clicks);
  const actualRoas = safeDiv(d.conversion_value, d.cost);
  const expectedApprovedRevenue = d.conversion_value * d.approval_rate;
  const expectedApprovedRoas = safeDiv(expectedApprovedRevenue, d.cost);
  const profit = expectedApprovedRevenue - d.cost;
  const valuePerCv = safeDiv(d.conversion_value, d.conversions);

  const [cvrLow, cvrHigh] = betaCredibleInterval(d.conversions, d.affiliate_clicks, d.credible_level);
  let roasLow = 0;
  let roasHigh = 0;
  if (d.conversions > 0 && d.cost > 0 && d.affiliate_clicks > 0) {
    const unit = (valuePerCv * d.approval_rate * d.affiliate_clicks) / d.cost;
    roasLow = cvrLow * unit;
    roasHigh = cvrHigh * unit;
  }

  const ranked = diagnoseBottlenecks({
    adCtr, lpCtr, affiliateCvr, actualRoas, expectedApprovedRoas,
    targetRoas: d.target_roas, clicks: d.clicks,
    affiliateClicks: d.affiliate_clicks, conversions: d.conversions,
  });

  const plan = buildImprovementPlan({
    targetRoas: d.target_roas, expectedApprovedRoas, actualCpc, lpCtr,
    affiliateCvr, adCtr, clicks: d.clicks, conversions: d.conversions,
    marketCpcFloor: d.market_cpc_floor,
  });

  const zeroCv = zeroCvEvidence(d, d.affiliate_clicks);
  const reasons = [];
  const recommendations = [];
  let budgetSuggestion = null;
  let decision;

  if (d.conversions === 0 && d.max_test_budget > 0 && d.cost >= d.max_test_budget) {
    decision = 'STOP';
    reasons.push('MAX_TEST_BUDGET_EXCEEDED_ZERO_CV');
    recommendations.push('テスト上限に到達しCV0。案件またはKW群を停止し、構造を再評価する。');
  } else if (zeroCv.significant) {
    decision = 'STOP';
    reasons.push('ZERO_CV_STATISTICALLY_SIGNIFICANT');
    recommendations.push(
      `損益分岐に必要なアフィCVRは${(zeroCv.required_affiliate_cvr * 100).toFixed(2)}%。` +
      `それが真ならこの${d.affiliate_clicks}クリック連続CV0は確率${(zeroCv.p_zero_given_required * 100).toFixed(1)}%しかない。構造的に届かないと判断する。`
    );
  } else if (d.conversions === 0 && d.stop_after_zero_cv_clicks > 0 && d.clicks >= d.stop_after_zero_cv_clicks) {
    decision = 'STOP';
    reasons.push('ZERO_CV_CLICK_LIMIT_EXCEEDED');
    recommendations.push('設定したCV0上限クリック数を超過。追加出稿を止め、検索語句とLP導線を監査する。');
  } else if (d.clicks < d.min_test_clicks) {
    decision = 'TEST';
    reasons.push('INSUFFICIENT_CLICK_DATA');
    recommendations.push(`クリック${d.clicks}件。判定に必要な${d.min_test_clicks}件まではテスト継続。`);
    if (zeroCv.applicable && zeroCv.clicks_needed) {
      recommendations.push(`CV0で撤退を確定させるにはアフィクリック${Math.round(zeroCv.clicks_needed)}件が必要。`);
    }
  } else if (d.conversions === 0) {
    decision = 'TEST';
    reasons.push('ZERO_CV_NOT_YET_CONCLUSIVE');
    if (zeroCv.applicable) {
      const remaining = Math.max(0, zeroCv.clicks_needed - d.affiliate_clicks);
      recommendations.push(
        `CV0だが判断材料が不足。損益分岐に必要なアフィCVR${(zeroCv.required_affiliate_cvr * 100).toFixed(2)}%を棄却するにはアフィクリックがあと約${Math.round(remaining)}件必要。`
      );
    } else {
      recommendations.push('CV0だが撤退条件は未達。成果単価を設定すると統計的な撤退ラインを算出できる。');
    }
    recommendations.push('並行して計測連携（gclid引き継ぎ）が生きているか確認する。');
  } else if (
    d.conversions >= d.minimum_scale_conversions &&
    actualRoas >= d.target_roas * d.scale_roas_multiplier &&
    expectedApprovedRoas >= d.target_roas &&
    roasLow >= d.target_roas
  ) {
    decision = 'SCALE';
    reasons.push('ROAS_AND_CONVERSION_VOLUME_STRONG');
    reasons.push('CREDIBLE_LOWER_BOUND_ABOVE_TARGET');
    const margin = safeDiv(roasLow, d.target_roas);
    const step = margin >= 1.3 ? 0.3 : margin >= 1.1 ? 0.2 : 0.1;
    budgetSuggestion = {
      daily_budget_change_pct: round(step * 100, 1),
      basis: `信用区間下限ROAS ${roasLow.toFixed(2)} / 目標 ${d.target_roas.toFixed(2)}`,
    };
    recommendations.push(`日予算を+${(step * 100).toFixed(0)}%ずつ段階的に増額し、3日ごとに再判定する。`);
    recommendations.push('成果が出ているKWクラスターの近接語を追加テストする。');
  } else if (
    d.conversions >= d.minimum_scale_conversions &&
    expectedApprovedRoas >= d.target_roas * d.scale_roas_multiplier &&
    roasLow < d.target_roas
  ) {
    decision = 'KEEP';
    reasons.push('STRONG_POINT_ESTIMATE_WEAK_EVIDENCE');
    recommendations.push(
      `実績ROASは高いが信用区間下限は${roasLow.toFixed(2)}で目標${d.target_roas.toFixed(2)}を下回る。予算据え置きでCVを積み増してからSCALEする。`
    );
  } else if (expectedApprovedRoas >= d.target_roas) {
    decision = 'KEEP';
    reasons.push('TARGET_ROAS_MET');
    recommendations.push('承認後ROASが目標到達。配信を維持し、追加データで再判定する。');
  } else {
    const score = plan.feasibility_score;
    if (score >= 40) {
      decision = 'IMPROVE';
      reasons.push('IMPROVEMENT_PATH_FEASIBLE');
    } else if (score >= 20) {
      decision = 'IMPROVE';
      reasons.push('IMPROVEMENT_PATH_MARGINAL');
      recommendations.push('改善余地は薄い。撤退ラインを先に決めてから1回だけ改善を試す。');
    } else {
      decision = 'STOP';
      reasons.push('IMPROVEMENT_INFEASIBLE');
    }
    if (plan.best_path) recommendations.push(`最小改善経路: ${plan.best_path.description}`);
    for (const b of ranked.slice(0, 2)) recommendations.push(`[${b.label}] ${b.message}`);
  }

  if (recommendations.length === 0) recommendations.push('KW・LP・CPCの改善幅を分解して再テストする。');

  return {
    ad_ctr: round(adCtr, 6),
    actual_cpc: round(actualCpc, 4),
    lp_to_affiliate_ctr: round(lpCtr, 6),
    affiliate_cvr: round(affiliateCvr, 6),
    ad_to_final_cvr: round(adToFinalCvr, 6),
    actual_roas: round(actualRoas, 6),
    expected_approved_revenue: round(expectedApprovedRevenue, 4),
    expected_approved_roas: round(expectedApprovedRoas, 6),
    profit: round(profit, 2),
    value_per_conversion: round(valuePerCv, 2),
    roas_credible_low: round(roasLow, 6),
    roas_credible_high: round(roasHigh, 6),
    bottleneck: ranked.length ? ranked[0].code : 'NONE_CRITICAL',
    bottlenecks: ranked,
    improvement: plan,
    evidence: {
      credible_level: d.credible_level,
      conversion_rate_low: round(cvrLow, 6),
      conversion_rate_high: round(cvrHigh, 6),
      zero_cv: zeroCv,
    },
    budget_suggestion: budgetSuggestion,
    decision,
    reason_codes: reasons,
    recommendations,
  };
}

// ============================================================ KWスコアリング

const DEFAULT_CLICK_SHARE = 0.05;

export function normalizeKeyword(keyword) {
  return (keyword || '').normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

function estimateMarketCpc(kw) {
  if (kw.forecast_cpc > 0) return kw.forecast_cpc;
  const bids = [kw.low_bid, kw.high_bid].filter((b) => b > 0);
  if (bids.length === 2) return bids[0] + (bids[1] - bids[0]) * 0.6;
  if (bids.length === 1) return bids[0];
  return 0;
}

function estimateMonthlyClicks(kw) {
  if (kw.forecast_clicks > 0) return kw.forecast_clicks;
  if (!(kw.avg_monthly_searches > 0)) return 0;
  const comp = kw.competition_index == null ? 50 : kw.competition_index;
  const share = DEFAULT_CLICK_SHARE * (1 - 0.5 * Math.min(1, Math.max(0, comp) / 100));
  return kw.avg_monthly_searches * share;
}

function profitScore(profit) {
  if (profit <= 0) return 0;
  return Math.min(100, 25 * Math.log10(profit + 1));
}

export function scoreKeyword(raw, offer) {
  const kw = {
    avg_monthly_searches: 0, competition_index: null, low_bid: 0, high_bid: 0,
    forecast_cpc: 0, forecast_clicks: 0, intent: '', cluster: '',
    commercial_intent: 50, conversion_distance: 50, noise_risk: 30,
    estimated_lp_ctr: 0.3, ai_confidence: 0.5,
    blocked_by_rule: false, blocked_reason: '',
    ...raw,
  };

  const epc = offer.payout * offer.approval_rate * offer.advertiser_cvr;
  const marketCpc = estimateMarketCpc(kw);
  const requiredLpCtr = safeDiv(marketCpc * offer.target_roas, epc);
  const headroom = safeDiv(kw.estimated_lp_ctr, requiredLpCtr);
  const monthlyClicks = estimateMonthlyClicks(kw);
  const adClickEpc = epc * kw.estimated_lp_ctr;
  const monthlyProfit = monthlyClicks * (adClickEpc - marketCpc);

  const reasons = [];
  let bucket;
  if (kw.blocked_by_rule) {
    bucket = 'EXCLUDE';
    reasons.push(`案件ルールで禁止: ${kw.blocked_reason || '規約NG'}`);
  } else if (epc <= 0) {
    bucket = 'EXCLUDE';
    reasons.push('案件の期待値が0。採算計算が成立しない。');
  } else if (requiredLpCtr > 1) {
    bucket = 'EXCLUDE';
    reasons.push(`必要LP CTR ${(requiredLpCtr * 100).toFixed(0)}% > 100%。構造的に採算不可能。`);
  } else if (kw.noise_risk >= 80) {
    bucket = 'EXCLUDE';
    reasons.push('ノイズリスクが高すぎる。除外KW候補。');
  } else if (marketCpc <= 0) {
    bucket = 'DISCOVERY';
    reasons.push('CPCデータ未取得。少額テストで実測する。');
  } else if (headroom >= 1 && kw.commercial_intent >= 60 && monthlyClicks >= 5) {
    bucket = 'CORE';
    reasons.push(`商用意図${kw.commercial_intent.toFixed(0)}／CPC余裕率${headroom.toFixed(2)}／月間見込${monthlyClicks.toFixed(0)}クリック。`);
  } else if (headroom >= 1 && monthlyProfit > 0) {
    bucket = 'OPPORTUNITY';
    reasons.push(`意図は中程度だがCPC余裕率${headroom.toFixed(2)}で採算余地あり。`);
  } else if (headroom >= 0.7 && kw.ai_confidence < 0.6) {
    bucket = 'DISCOVERY';
    reasons.push('AIの確信度が低く実績もない。少額で検証する価値がある。');
  } else if (headroom >= 0.7) {
    bucket = 'OPPORTUNITY';
    reasons.push(`CPC余裕率${headroom.toFixed(2)}。LP改善前提なら成立余地あり。`);
  } else {
    bucket = 'EXCLUDE';
    reasons.push(`CPC余裕率${headroom.toFixed(2)}。必要CTRに届かない。`);
  }

  const headroomScore = Math.min(100, headroom * 50);
  const intentScore = Math.max(
    0, kw.commercial_intent * 0.6 + kw.conversion_distance * 0.4 - kw.noise_risk * 0.5
  );
  let priority =
    0.35 * headroomScore +
    0.35 * profitScore(monthlyProfit) +
    0.2 * Math.min(100, intentScore) +
    0.1 * kw.ai_confidence * 100;
  if (bucket === 'EXCLUDE') priority = 0;

  return {
    keyword: kw.keyword,
    normalized_keyword: normalizeKeyword(kw.keyword),
    cluster: kw.cluster || '(未分類)',
    intent: kw.intent,
    bucket,
    market_cpc: round(marketCpc, 2),
    required_lp_ctr: round(requiredLpCtr, 6),
    estimated_lp_ctr: round(kw.estimated_lp_ctr, 6),
    cpc_headroom: round(headroom, 4),
    expected_monthly_clicks: round(monthlyClicks, 1),
    expected_monthly_profit: round(monthlyProfit, 0),
    priority_score: round(priority, 1),
    reasons,
  };
}

export function scoreKeywords(keywords, offer) {
  return keywords.map((k) => scoreKeyword(k, offer)).sort((a, b) => b.priority_score - a.priority_score);
}

export function aggregateClusters(scores) {
  const buckets = new Map();
  for (const s of scores) {
    if (!buckets.has(s.cluster)) buckets.set(s.cluster, []);
    buckets.get(s.cluster).push(s);
  }
  const out = [];
  for (const [cluster, items] of buckets) {
    const clicks = items.reduce((a, i) => a + i.expected_monthly_clicks, 0);
    const profit = items.reduce((a, i) => a + i.expected_monthly_profit, 0);
    const weightedCpc = safeDiv(
      items.reduce((a, i) => a + i.market_cpc * i.expected_monthly_clicks, 0), clicks
    );
    const counts = {};
    for (const i of items) counts[i.bucket] = (counts[i.bucket] || 0) + 1;
    out.push({
      cluster,
      keyword_count: items.length,
      actionable_count: items.filter((i) => i.bucket !== 'EXCLUDE').length,
      expected_monthly_clicks: round(clicks, 1),
      expected_monthly_profit: round(profit, 0),
      weighted_market_cpc: round(weightedCpc, 2),
      avg_priority_score: round(safeDiv(items.reduce((a, i) => a + i.priority_score, 0), items.length), 1),
      bucket_counts: counts,
      top_keywords: [...items].sort((a, b) => b.priority_score - a.priority_score).slice(0, 5).map((i) => i.keyword),
    });
  }
  out.sort((a, b) => b.expected_monthly_profit - a.expected_monthly_profit);
  return out;
}
