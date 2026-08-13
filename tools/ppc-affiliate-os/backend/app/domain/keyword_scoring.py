"""KWの採算判定とバケット分類（SPEC 7章 Step7 / 9章）。

SPEC 22.2「AIは意思決定の根拠ではなく補助」に従い、
CORE / OPPORTUNITY / DISCOVERY / EXCLUDE の最終判定はここ（コード）で決める。
AIは意図・商用度・想定LP CTR・クラスタ名という“入力”だけを供給する。

ロングテールを単体検索数で切り捨てないため（SPEC 22.3）、
クラスタ単位の集計関数も併せて提供する。
"""
from __future__ import annotations

import math
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from app.domain.economics import safe_div

__all__ = [
    "OfferEconomics",
    "KeywordInput",
    "KeywordScore",
    "normalize_keyword",
    "score_keyword",
    "score_keywords",
    "aggregate_clusters",
]

# 検索数からクリック数を見積もるときの既定シェア（実績が入ったら上書きする）
DEFAULT_CLICK_SHARE = 0.05


def normalize_keyword(keyword: str) -> str:
    """全角/半角・大文字小文字・空白のゆらぎを吸収した正規化キー。"""
    text = unicodedata.normalize("NFKC", keyword or "").strip().lower()
    return " ".join(text.split())


@dataclass(frozen=True)
class OfferEconomics:
    payout: float
    approval_rate: float
    advertiser_cvr: float
    target_roas: float

    @property
    def affiliate_click_epc(self) -> float:
        return self.payout * self.approval_rate * self.advertiser_cvr


@dataclass(frozen=True)
class KeywordInput:
    keyword: str
    # --- Google Ads 由来 ---
    avg_monthly_searches: float = 0.0
    competition_index: Optional[float] = None  # 0-100
    low_bid: Optional[float] = None
    high_bid: Optional[float] = None
    forecast_cpc: Optional[float] = None
    forecast_clicks: Optional[float] = None
    # --- AI 由来（あくまで仮説） ---
    intent: str = ""
    cluster: str = ""
    commercial_intent: float = 50.0  # 0-100
    conversion_distance: float = 50.0  # 0-100 (高いほど成約に近い)
    noise_risk: float = 30.0  # 0-100
    estimated_lp_ctr: float = 0.30
    ai_confidence: float = 0.5
    # --- 案件ルール ---
    blocked_by_rule: bool = False
    blocked_reason: str = ""


@dataclass(frozen=True)
class KeywordScore:
    keyword: str
    normalized_keyword: str
    cluster: str
    intent: str
    bucket: str
    market_cpc: float
    required_lp_ctr: float
    estimated_lp_ctr: float
    cpc_headroom: float
    expected_monthly_clicks: float
    expected_monthly_profit: float
    priority_score: float
    reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _estimate_market_cpc(kw: KeywordInput) -> float:
    if kw.forecast_cpc and kw.forecast_cpc > 0:
        return kw.forecast_cpc
    bids = [b for b in (kw.low_bid, kw.high_bid) if b and b > 0]
    if len(bids) == 2:
        # 上限寄りに置く。上限入札で取れないKWを楽観視しないため 60% 地点。
        return bids[0] + (bids[1] - bids[0]) * 0.6
    if bids:
        return bids[0]
    return 0.0


def _estimate_monthly_clicks(kw: KeywordInput) -> float:
    if kw.forecast_clicks and kw.forecast_clicks > 0:
        return kw.forecast_clicks
    if kw.avg_monthly_searches <= 0:
        return 0.0
    # 競合が激しいほど取れるシェアは落ちる
    comp = kw.competition_index if kw.competition_index is not None else 50.0
    share = DEFAULT_CLICK_SHARE * (1.0 - 0.5 * min(1.0, max(0.0, comp) / 100.0))
    return kw.avg_monthly_searches * share


def _profit_score(profit: float) -> float:
    """月間利益ポテンシャルを0〜100へ。対数スケールで小口を潰しすぎない。"""
    if profit <= 0:
        return 0.0
    # 10,000円で50点、100,000円で75点あたりの感覚
    return min(100.0, 25.0 * math.log10(profit + 1.0))


def score_keyword(kw: KeywordInput, offer: OfferEconomics) -> KeywordScore:
    normalized = normalize_keyword(kw.keyword)
    market_cpc = _estimate_market_cpc(kw)
    epc = offer.affiliate_click_epc
    reasons: List[str] = []

    required_lp_ctr = safe_div(market_cpc * offer.target_roas, epc)
    headroom = safe_div(kw.estimated_lp_ctr, required_lp_ctr)
    monthly_clicks = _estimate_monthly_clicks(kw)
    ad_click_epc = epc * kw.estimated_lp_ctr
    monthly_profit = monthly_clicks * (ad_click_epc - market_cpc)

    # --- バケット判定はすべてルールベース ---
    if kw.blocked_by_rule:
        bucket = "EXCLUDE"
        reasons.append(f"案件ルールで禁止: {kw.blocked_reason or '規約NG'}")
    elif epc <= 0:
        bucket = "EXCLUDE"
        reasons.append("案件の期待値が0。採算計算が成立しない。")
    elif required_lp_ctr > 1.0:
        bucket = "EXCLUDE"
        reasons.append(f"必要LP CTR {required_lp_ctr * 100:.0f}% > 100%。構造的に採算不可能。")
    elif kw.noise_risk >= 80:
        bucket = "EXCLUDE"
        reasons.append("ノイズリスクが高すぎる。除外KW候補。")
    elif market_cpc <= 0:
        # 市場データがまだない = 少額で試す価値
        bucket = "DISCOVERY"
        reasons.append("CPCデータ未取得。少額テストで実測する。")
    elif headroom >= 1.0 and kw.commercial_intent >= 60 and monthly_clicks >= 5:
        bucket = "CORE"
        reasons.append(f"商用意図{kw.commercial_intent:.0f}／CPC余裕率{headroom:.2f}／月間見込{monthly_clicks:.0f}クリック。")
    elif headroom >= 1.0 and monthly_profit > 0:
        bucket = "OPPORTUNITY"
        reasons.append(f"意図は中程度だがCPC余裕率{headroom:.2f}で採算余地あり。")
    elif headroom >= 0.7 and kw.ai_confidence < 0.6:
        bucket = "DISCOVERY"
        reasons.append("AIの確信度が低く実績もない。少額で検証する価値がある。")
    elif headroom >= 0.7:
        bucket = "OPPORTUNITY"
        reasons.append(f"CPC余裕率{headroom:.2f}。LP改善前提なら成立余地あり。")
    else:
        bucket = "EXCLUDE"
        reasons.append(f"CPC余裕率{headroom:.2f}。必要CTRに届かない。")

    # --- 優先度スコア ---
    headroom_score = min(100.0, headroom * 50.0)  # 2.0倍で満点
    intent_score = max(0.0, kw.commercial_intent * 0.6 + kw.conversion_distance * 0.4 - kw.noise_risk * 0.5)
    priority = (
        0.35 * headroom_score
        + 0.35 * _profit_score(monthly_profit)
        + 0.20 * min(100.0, intent_score)
        + 0.10 * kw.ai_confidence * 100.0
    )
    if bucket == "EXCLUDE":
        priority = 0.0

    return KeywordScore(
        keyword=kw.keyword,
        normalized_keyword=normalized,
        cluster=kw.cluster or "(未分類)",
        intent=kw.intent,
        bucket=bucket,
        market_cpc=round(market_cpc, 2),
        required_lp_ctr=round(required_lp_ctr, 6),
        estimated_lp_ctr=round(kw.estimated_lp_ctr, 6),
        cpc_headroom=round(headroom, 4),
        expected_monthly_clicks=round(monthly_clicks, 1),
        expected_monthly_profit=round(monthly_profit, 0),
        priority_score=round(priority, 1),
        reasons=reasons,
    )


def score_keywords(keywords: Iterable[KeywordInput], offer: OfferEconomics) -> List[KeywordScore]:
    scored = [score_keyword(kw, offer) for kw in keywords]
    scored.sort(key=lambda s: s.priority_score, reverse=True)
    return scored


def aggregate_clusters(scores: Iterable[KeywordScore]) -> List[Dict[str, Any]]:
    """クラスタ単位の市場性。単体検索数が小さいKWを束ねて評価するため（SPEC 22.3）。"""
    buckets: Dict[str, List[KeywordScore]] = {}
    for s in scores:
        buckets.setdefault(s.cluster, []).append(s)

    out: List[Dict[str, Any]] = []
    for cluster, items in buckets.items():
        clicks = sum(i.expected_monthly_clicks for i in items)
        profit = sum(i.expected_monthly_profit for i in items)
        weighted_cpc = safe_div(
            sum(i.market_cpc * i.expected_monthly_clicks for i in items), clicks
        )
        counts: Dict[str, int] = {}
        for i in items:
            counts[i.bucket] = counts.get(i.bucket, 0) + 1
        actionable = [i for i in items if i.bucket != "EXCLUDE"]
        out.append(
            {
                "cluster": cluster,
                "keyword_count": len(items),
                "actionable_count": len(actionable),
                "expected_monthly_clicks": round(clicks, 1),
                "expected_monthly_profit": round(profit, 0),
                "weighted_market_cpc": round(weighted_cpc, 2),
                "avg_priority_score": round(
                    safe_div(sum(i.priority_score for i in items), len(items)), 1
                ),
                "bucket_counts": counts,
                "top_keywords": [i.keyword for i in sorted(
                    items, key=lambda x: x.priority_score, reverse=True
                )[:5]],
            }
        )
    out.sort(key=lambda c: c["expected_monthly_profit"], reverse=True)
    return out
