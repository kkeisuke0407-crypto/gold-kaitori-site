"""採算計算（SPEC 8章）。出稿前にいくらまで払えるかを逆算する。

MVPからの変更点:
  * `advertiser_cvr_confidence` を実際に使う。広告主CVRが推定値のときは
    ダウンサイドケースを併走させ、「弱気シナリオでも黒字か」で GO を出す。
  * 月間利益ポテンシャル（SPEC 8.7）を実装。
  * 判定を GO / TEST / STOP の3値に整理し、理由コードを積む。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

__all__ = [
    "Decision",
    "PreflightInput",
    "PreflightResult",
    "Economics",
    "compute_economics",
    "calculate_preflight",
    "safe_div",
]


class Decision(str, Enum):
    GO = "GO"
    TEST = "TEST"
    SCALE = "SCALE"
    KEEP = "KEEP"
    IMPROVE = "IMPROVE"
    STOP = "STOP"


def safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


@dataclass(frozen=True)
class Economics:
    """1つのシナリオ（基準／弱気／強気）の採算指標。"""

    advertiser_cvr: float
    affiliate_click_epc: float
    ad_click_epc: float
    break_even_cpc: float
    target_cpc: float
    required_lp_ctr: float
    cpc_headroom: float
    monthly_profit_potential: float

    def to_dict(self) -> Dict[str, Any]:
        return {k: round(v, 6) for k, v in asdict(self).items()}


@dataclass(frozen=True)
class PreflightInput:
    payout: float
    approval_rate: float
    advertiser_cvr: float
    target_roas: float
    market_cpc: float
    estimated_lp_ctr: float
    # 広告主CVRの確信度 0〜1。1.0 = 実績値として信頼できる（既定）。
    advertiser_cvr_confidence: float = 1.0
    expected_monthly_clicks: float = 0.0


@dataclass(frozen=True)
class PreflightResult:
    # 基準シナリオ（後方互換のためトップレベルに展開する）
    affiliate_click_epc: float
    ad_click_epc: float
    break_even_cpc: float
    target_cpc: float
    required_lp_ctr: float
    cpc_headroom: float
    monthly_profit_potential: float
    decision: Decision
    reason_codes: List[str]
    base: Dict[str, Any] = field(default_factory=dict)
    downside: Dict[str, Any] = field(default_factory=dict)
    upside: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["decision"] = self.decision.value
        return d


# 確信度が低いほど広げる、広告主CVRの振れ幅（confidence=0 で ±50%）。
_MAX_CVR_SWING = 0.5


def compute_economics(
    payout: float,
    approval_rate: float,
    advertiser_cvr: float,
    target_roas: float,
    market_cpc: float,
    lp_ctr: float,
    expected_monthly_clicks: float = 0.0,
) -> Economics:
    affiliate_click_epc = payout * approval_rate * advertiser_cvr
    ad_click_epc = affiliate_click_epc * lp_ctr
    target_cpc = safe_div(ad_click_epc, target_roas)
    required_lp_ctr = safe_div(market_cpc * target_roas, affiliate_click_epc)
    return Economics(
        advertiser_cvr=advertiser_cvr,
        affiliate_click_epc=affiliate_click_epc,
        ad_click_epc=ad_click_epc,
        break_even_cpc=ad_click_epc,
        target_cpc=target_cpc,
        required_lp_ctr=required_lp_ctr,
        cpc_headroom=safe_div(target_cpc, market_cpc),
        monthly_profit_potential=expected_monthly_clicks * (ad_click_epc - market_cpc),
    )


def _validate(data: PreflightInput) -> None:
    if data.payout < 0:
        raise ValueError("payout must be >= 0")
    if data.market_cpc < 0:
        raise ValueError("market_cpc must be >= 0")
    if data.expected_monthly_clicks < 0:
        raise ValueError("expected_monthly_clicks must be >= 0")
    if data.target_roas <= 0:
        raise ValueError("target_roas must be > 0")
    for name, value in (
        ("approval_rate", data.approval_rate),
        ("advertiser_cvr", data.advertiser_cvr),
        ("estimated_lp_ctr", data.estimated_lp_ctr),
        ("advertiser_cvr_confidence", data.advertiser_cvr_confidence),
    ):
        if not 0 <= value <= 1:
            raise ValueError(f"{name} must be between 0 and 1")


def calculate_preflight(data: PreflightInput) -> PreflightResult:
    """出稿前判定。基準／弱気／強気の3シナリオを出し、弱気基準でGOを決める。"""
    _validate(data)

    swing = (1.0 - data.advertiser_cvr_confidence) * _MAX_CVR_SWING
    scenarios = {
        "base": data.advertiser_cvr,
        "downside": max(0.0, data.advertiser_cvr * (1.0 - swing)),
        "upside": min(1.0, data.advertiser_cvr * (1.0 + swing)),
    }
    econ = {
        name: compute_economics(
            payout=data.payout,
            approval_rate=data.approval_rate,
            advertiser_cvr=cvr,
            target_roas=data.target_roas,
            market_cpc=data.market_cpc,
            lp_ctr=data.estimated_lp_ctr,
            expected_monthly_clicks=data.expected_monthly_clicks,
        )
        for name, cvr in scenarios.items()
    }
    base, downside = econ["base"], econ["downside"]

    reasons: List[str] = []
    notes: List[str] = []

    if base.affiliate_click_epc <= 0:
        decision = Decision.STOP
        reasons.append("ZERO_EXPECTED_VALUE")
        notes.append("成果単価・承認率・広告主CVRのいずれかが0。採算は構造的に成立しない。")
    elif base.required_lp_ctr > 1.0:
        decision = Decision.STOP
        reasons.append("REQUIRED_LP_CTR_OVER_100")
        notes.append(
            f"必要LP→アフィCTRが{base.required_lp_ctr * 100:.1f}%。"
            "100%を超えるため、どんなLPでも目標ROASに到達しない。"
        )
    elif downside.cpc_headroom >= 1.30:
        decision = Decision.GO
        reasons.append("STRONG_CPC_HEADROOM")
        notes.append("弱気シナリオでもCPC余裕率1.3倍以上。優先的に出稿してよい。")
    elif downside.cpc_headroom >= 1.0:
        decision = Decision.GO
        reasons.append("POSITIVE_CPC_HEADROOM")
        notes.append("弱気シナリオでも損益分岐を上回る。テスト予算を通常配分でよい。")
    elif base.cpc_headroom >= 1.0:
        decision = Decision.TEST
        reasons.append("BASE_OK_DOWNSIDE_RISK")
        notes.append(
            "基準シナリオでは黒字だが、広告主CVRが想定より低いと赤字化する。"
            "少額テストで実CVRを確定させてから増額する。"
        )
    elif base.cpc_headroom >= 0.80:
        decision = Decision.TEST
        reasons.append("IMPROVEMENT_REQUIRED")
        notes.append(
            f"必要LP CTR {base.required_lp_ctr * 100:.1f}% に対し想定 "
            f"{data.estimated_lp_ctr * 100:.1f}%。LP改善前提でのテストなら成立余地あり。"
        )
    else:
        decision = Decision.STOP
        reasons.append("STRUCTURAL_CPC_GAP")
        notes.append(
            f"CPC余裕率{base.cpc_headroom:.2f}。市場CPCと上限CPCの差が大きく、"
            "LP改善だけでは埋まらない。"
        )

    if data.advertiser_cvr_confidence < 1.0:
        reasons.append("CVR_ESTIMATE_UNCERTAIN")

    return PreflightResult(
        affiliate_click_epc=round(base.affiliate_click_epc, 4),
        ad_click_epc=round(base.ad_click_epc, 4),
        break_even_cpc=round(base.break_even_cpc, 4),
        target_cpc=round(base.target_cpc, 4),
        required_lp_ctr=round(base.required_lp_ctr, 6),
        cpc_headroom=round(base.cpc_headroom, 6),
        monthly_profit_potential=round(base.monthly_profit_potential, 2),
        decision=decision,
        reason_codes=reasons,
        base=base.to_dict(),
        downside=downside.to_dict(),
        upside=econ["upside"].to_dict(),
        notes=notes,
    )
