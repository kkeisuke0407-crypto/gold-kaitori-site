"""意思決定エンジン（SPEC 12章）。SCALE / KEEP / IMPROVE / TEST / STOP を決める。

MVPからの主な変更:
  1. SCALE に「ベイズ信用区間の下限でも目標ROASを超えること」を条件追加。
     CV数件の偶然でスケールして溶かす事故を止める。
  2. ゼロCV撤退を統計的に判定。固定クリック数だけでなく
     「損益分岐に必要なCVRが本当ならこの連続0はあり得ない」を根拠にする。
  3. IMPROVE / STOP の分岐を improvement.py の実現性スコアに委ねる。
  4. ボトルネックをランキングで返す。

`calculate_preflight` は economics.py から再エクスポートしている（後方互換）。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from app.domain.bottleneck import DEFAULT_BENCHMARKS, Benchmarks, diagnose
from app.domain.economics import (  # noqa: F401  (再エクスポート)
    Decision,
    Economics,
    PreflightInput,
    PreflightResult,
    calculate_preflight,
    compute_economics,
    safe_div,
)
from app.domain.improvement import build_improvement_plan
from app.domain.stats import beta_credible_interval, clicks_to_rule_out_rate, zero_event_probability

__all__ = [
    "Decision",
    "PreflightInput",
    "PreflightResult",
    "RuntimeInput",
    "RuntimeResult",
    "calculate_preflight",
    "evaluate_runtime",
]


@dataclass(frozen=True)
class RuntimeInput:
    impressions: int
    clicks: int
    cost: float
    affiliate_clicks: int
    conversions: float
    conversion_value: float
    approval_rate: float
    target_roas: float
    max_test_budget: float
    min_test_clicks: int
    stop_after_zero_cv_clicks: int
    scale_roas_multiplier: float = 1.2
    minimum_scale_conversions: float = 3.0
    # 以下は任意。渡すと統計的なゼロCV撤退判定が有効になる。
    payout: Optional[float] = None
    advertiser_cvr: Optional[float] = None
    # SCALE判定に使う信用区間の水準（0.80 = 下限10パーセンタイル）
    credible_level: float = 0.80
    # ゼロCV撤退の有意水準
    zero_cv_alpha: float = 0.05
    market_cpc_floor: Optional[float] = None


@dataclass(frozen=True)
class RuntimeResult:
    ad_ctr: float
    actual_cpc: float
    lp_to_affiliate_ctr: float
    affiliate_cvr: float
    ad_to_final_cvr: float
    actual_roas: float
    expected_approved_revenue: float
    expected_approved_roas: float
    bottleneck: str
    decision: Decision
    reason_codes: List[str]
    recommendations: List[str]
    # v0.2 追加
    profit: float = 0.0
    value_per_conversion: float = 0.0
    roas_credible_low: float = 0.0
    roas_credible_high: float = 0.0
    bottlenecks: List[Dict[str, Any]] = field(default_factory=list)
    improvement: Dict[str, Any] = field(default_factory=dict)
    evidence: Dict[str, Any] = field(default_factory=dict)
    budget_suggestion: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["decision"] = self.decision.value
        return d


def _validate(data: RuntimeInput) -> None:
    if data.impressions < 0 or data.clicks < 0 or data.affiliate_clicks < 0:
        raise ValueError("counts must be >= 0")
    if data.cost < 0 or data.conversions < 0 or data.conversion_value < 0:
        raise ValueError("cost/conversions/value must be >= 0")
    if not 0 <= data.approval_rate <= 1:
        raise ValueError("approval_rate must be between 0 and 1")
    if data.target_roas <= 0:
        raise ValueError("target_roas must be > 0")
    if not 0 < data.credible_level < 1:
        raise ValueError("credible_level must be between 0 and 1")


def _zero_cv_evidence(data: RuntimeInput) -> Dict[str, Any]:
    """CV0のとき「もう見切ってよいか」を統計的に評価する。

    損益分岐に必要なアフィCVRを payout から逆算し、
    そのCVRが真だとしたらこの連続ゼロが起きる確率を出す。
    """
    out: Dict[str, Any] = {"applicable": False}
    if data.conversions > 0 or data.payout is None or data.payout <= 0:
        return out
    if data.affiliate_clicks <= 0 or data.cost <= 0:
        return out

    revenue_per_cv = data.payout * data.approval_rate
    if revenue_per_cv <= 0:
        return out
    # 目標ROAS達成に必要な成果件数 → 1アフィクリックあたりの必要CVR
    required_conversions = data.cost * data.target_roas / revenue_per_cv
    required_cvr = required_conversions / data.affiliate_clicks
    if required_cvr >= 1.0:
        return {
            "applicable": True,
            "required_affiliate_cvr": round(required_cvr, 6),
            "p_zero_given_required": 0.0,
            "significant": True,
            "clicks_needed": 0.0,
        }

    p_zero = zero_event_probability(data.affiliate_clicks, required_cvr)
    needed = clicks_to_rule_out_rate(required_cvr, data.zero_cv_alpha)
    return {
        "applicable": True,
        "required_affiliate_cvr": round(required_cvr, 6),
        "p_zero_given_required": round(p_zero, 6),
        "significant": p_zero < data.zero_cv_alpha,
        "clicks_needed": round(needed, 1),
    }


def evaluate_runtime(data: RuntimeInput, benchmarks: Benchmarks = DEFAULT_BENCHMARKS) -> RuntimeResult:
    _validate(data)

    ad_ctr = safe_div(data.clicks, data.impressions)
    actual_cpc = safe_div(data.cost, data.clicks)
    lp_ctr = safe_div(data.affiliate_clicks, data.clicks)
    affiliate_cvr = safe_div(data.conversions, data.affiliate_clicks)
    ad_to_final_cvr = safe_div(data.conversions, data.clicks)
    actual_roas = safe_div(data.conversion_value, data.cost)
    expected_approved_revenue = data.conversion_value * data.approval_rate
    expected_approved_roas = safe_div(expected_approved_revenue, data.cost)
    profit = expected_approved_revenue - data.cost
    value_per_cv = safe_div(data.conversion_value, data.conversions)

    # 成果発生率の信用区間 → ROASの下限・上限。SCALE判定の中核。
    cvr_low, cvr_high = beta_credible_interval(
        data.conversions, data.affiliate_clicks, level=data.credible_level
    )
    if data.conversions > 0 and data.cost > 0 and data.affiliate_clicks > 0:
        unit = value_per_cv * data.approval_rate * data.affiliate_clicks / data.cost
        roas_low, roas_high = cvr_low * unit, cvr_high * unit
    else:
        roas_low = roas_high = 0.0

    ranked = diagnose(
        ad_ctr=ad_ctr,
        lp_to_affiliate_ctr=lp_ctr,
        affiliate_cvr=affiliate_cvr,
        actual_roas=actual_roas,
        expected_approved_roas=expected_approved_roas,
        target_roas=data.target_roas,
        clicks=data.clicks,
        affiliate_clicks=data.affiliate_clicks,
        conversions=data.conversions,
        benchmarks=benchmarks,
    )
    top_bottleneck = ranked[0].code if ranked else "NONE_CRITICAL"

    plan = build_improvement_plan(
        target_roas=data.target_roas,
        expected_approved_roas=expected_approved_roas,
        actual_cpc=actual_cpc,
        lp_to_affiliate_ctr=lp_ctr,
        affiliate_cvr=affiliate_cvr,
        ad_ctr=ad_ctr,
        clicks=data.clicks,
        conversions=data.conversions,
        market_cpc_floor=data.market_cpc_floor,
    )

    zero_cv = _zero_cv_evidence(data)
    reasons: List[str] = []
    recommendations: List[str] = []
    budget_suggestion: Optional[Dict[str, Any]] = None

    # --- ハードストップを最優先で評価する ---
    if data.conversions == 0 and data.cost >= data.max_test_budget > 0:
        decision = Decision.STOP
        reasons.append("MAX_TEST_BUDGET_EXCEEDED_ZERO_CV")
        recommendations.append("テスト上限に到達しCV0。案件またはKW群を停止し、構造を再評価する。")

    elif zero_cv.get("significant"):
        decision = Decision.STOP
        reasons.append("ZERO_CV_STATISTICALLY_SIGNIFICANT")
        recommendations.append(
            f"損益分岐に必要なアフィCVRは{zero_cv['required_affiliate_cvr'] * 100:.2f}%。"
            f"それが真ならこの{data.affiliate_clicks}クリック連続CV0は確率"
            f"{zero_cv['p_zero_given_required'] * 100:.1f}%しかない。構造的に届かないと判断する。"
        )

    elif (
        data.conversions == 0
        and data.stop_after_zero_cv_clicks > 0
        and data.clicks >= data.stop_after_zero_cv_clicks
    ):
        decision = Decision.STOP
        reasons.append("ZERO_CV_CLICK_LIMIT_EXCEEDED")
        recommendations.append("設定したCV0上限クリック数を超過。追加出稿を止め、検索語句とLP導線を監査する。")

    elif data.clicks < data.min_test_clicks:
        decision = Decision.TEST
        reasons.append("INSUFFICIENT_CLICK_DATA")
        recommendations.append(
            f"クリック{data.clicks}件。判定に必要な{data.min_test_clicks}件まではテスト継続。"
        )
        if zero_cv.get("applicable") and zero_cv.get("clicks_needed"):
            recommendations.append(
                f"CV0で撤退を確定させるにはアフィクリック{zero_cv['clicks_needed']:.0f}件が必要。"
            )

    elif data.conversions == 0:
        # 撤退条件をどれも満たしていないCV0は「まだ分からない」であって失敗ではない。
        # ここでROAS 0 を根拠にSTOPすると、早すぎる見切りになる。
        decision = Decision.TEST
        reasons.append("ZERO_CV_NOT_YET_CONCLUSIVE")
        if zero_cv.get("applicable"):
            remaining = max(0.0, zero_cv["clicks_needed"] - data.affiliate_clicks)
            recommendations.append(
                f"CV0だが判断材料が不足。損益分岐に必要なアフィCVR"
                f"{zero_cv['required_affiliate_cvr'] * 100:.2f}%を棄却するには"
                f"アフィクリックがあと約{remaining:.0f}件必要。"
            )
        else:
            recommendations.append(
                "CV0だが撤退条件は未達。成果単価を設定すると統計的な撤退ラインを算出できる。"
            )
        recommendations.append("並行して計測連携（gclid引き継ぎ）が生きているか確認する。")

    # --- SCALE: 実力である証拠が揃っているときだけ ---
    elif (
        data.conversions >= data.minimum_scale_conversions
        and actual_roas >= data.target_roas * data.scale_roas_multiplier
        and expected_approved_roas >= data.target_roas
        and roas_low >= data.target_roas
    ):
        decision = Decision.SCALE
        reasons.append("ROAS_AND_CONVERSION_VOLUME_STRONG")
        reasons.append("CREDIBLE_LOWER_BOUND_ABOVE_TARGET")
        # 余裕率に応じて増額幅を出す。余裕が薄いときは小刻みに。
        margin = safe_div(roas_low, data.target_roas)
        step = 0.30 if margin >= 1.3 else 0.20 if margin >= 1.1 else 0.10
        budget_suggestion = {
            "daily_budget_change_pct": round(step * 100, 1),
            "basis": f"信用区間下限ROAS {roas_low:.2f} / 目標 {data.target_roas:.2f}",
        }
        recommendations.extend(
            [
                f"日予算を+{step * 100:.0f}%ずつ段階的に増額し、3日ごとに再判定する。",
                "成果が出ているKWクラスターの近接語を追加テストする。",
            ]
        )

    elif (
        data.conversions >= data.minimum_scale_conversions
        and expected_approved_roas >= data.target_roas * data.scale_roas_multiplier
        and roas_low < data.target_roas
    ):
        # 見かけは強いが、下限が目標を割る = まだ運の可能性がある
        decision = Decision.KEEP
        reasons.append("STRONG_POINT_ESTIMATE_WEAK_EVIDENCE")
        recommendations.append(
            f"実績ROASは高いが信用区間下限は{roas_low:.2f}で目標{data.target_roas:.2f}を下回る。"
            "予算据え置きでCVを積み増してからSCALEする。"
        )

    elif expected_approved_roas >= data.target_roas:
        decision = Decision.KEEP
        reasons.append("TARGET_ROAS_MET")
        recommendations.append("承認後ROASが目標到達。配信を維持し、追加データで再判定する。")

    else:
        # --- IMPROVE か STOP か。改善実現性スコアで分ける ---
        score = plan.feasibility_score
        if score >= 40:
            decision = Decision.IMPROVE
            reasons.append("IMPROVEMENT_PATH_FEASIBLE")
        elif score >= 20:
            decision = Decision.IMPROVE
            reasons.append("IMPROVEMENT_PATH_MARGINAL")
            recommendations.append("改善余地は薄い。撤退ラインを先に決めてから1回だけ改善を試す。")
        else:
            decision = Decision.STOP
            reasons.append("IMPROVEMENT_INFEASIBLE")

        if plan.best_path:
            recommendations.append(f"最小改善経路: {plan.best_path['description']}")
        for b in ranked[:2]:
            recommendations.append(f"[{b.label}] {b.message}")

    if not recommendations:
        recommendations.append("KW・LP・CPCの改善幅を分解して再テストする。")

    return RuntimeResult(
        ad_ctr=round(ad_ctr, 6),
        actual_cpc=round(actual_cpc, 4),
        lp_to_affiliate_ctr=round(lp_ctr, 6),
        affiliate_cvr=round(affiliate_cvr, 6),
        ad_to_final_cvr=round(ad_to_final_cvr, 6),
        actual_roas=round(actual_roas, 6),
        expected_approved_revenue=round(expected_approved_revenue, 4),
        expected_approved_roas=round(expected_approved_roas, 6),
        bottleneck=top_bottleneck,
        decision=decision,
        reason_codes=reasons,
        recommendations=recommendations,
        profit=round(profit, 2),
        value_per_conversion=round(value_per_cv, 2),
        roas_credible_low=round(roas_low, 6),
        roas_credible_high=round(roas_high, 6),
        bottlenecks=[b.to_dict() for b in ranked],
        improvement=plan.to_dict(),
        evidence={
            "credible_level": data.credible_level,
            "conversion_rate_low": round(cvr_low, 6),
            "conversion_rate_high": round(cvr_high, 6),
            "zero_cv": zero_cv,
        },
        budget_suggestion=budget_suggestion,
    )
