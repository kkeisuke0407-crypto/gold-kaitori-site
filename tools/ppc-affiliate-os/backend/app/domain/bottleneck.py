"""ボトルネック診断（SPEC 11章）。

MVPは「最大ボトルネックを1つの文字列で返す」だけだったが、実運用では
「どのレバーを直せば目標に届くのか、どれくらい届くのか」が要る。
ここでは各レバーをベンチマークまで直したときにROASギャップの何割が埋まるかを
計算し、寄与度の降順で並べて返す。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List

from app.domain.economics import safe_div

__all__ = ["Benchmarks", "Bottleneck", "diagnose", "DEFAULT_BENCHMARKS"]


@dataclass(frozen=True)
class Benchmarks:
    """健全値の目安。案件カテゴリごとに上書きできる。"""

    ad_ctr: float = 0.05
    lp_to_affiliate_ctr: float = 0.35
    affiliate_cvr: float = 0.05

    def to_dict(self) -> Dict[str, float]:
        return asdict(self)


DEFAULT_BENCHMARKS = Benchmarks()


@dataclass(frozen=True)
class Bottleneck:
    code: str
    label: str
    current: float
    benchmark: float
    # ベンチマークまで直したときの倍率（1.0 = 改善余地なし）
    uplift: float
    # ROASギャップのうち、このレバー単独で埋められる割合 0〜1
    gap_closed_ratio: float
    pattern: str
    message: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def diagnose(
    *,
    ad_ctr: float,
    lp_to_affiliate_ctr: float,
    affiliate_cvr: float,
    actual_roas: float,
    expected_approved_roas: float,
    target_roas: float,
    clicks: int,
    affiliate_clicks: int,
    conversions: float,
    benchmarks: Benchmarks = DEFAULT_BENCHMARKS,
) -> List[Bottleneck]:
    """寄与度の高い順にボトルネックを返す。ギャップがなければ空リスト。"""
    if clicks == 0:
        return [
            Bottleneck(
                code="NO_TRAFFIC",
                label="配信量",
                current=0.0,
                benchmark=0.0,
                uplift=0.0,
                gap_closed_ratio=0.0,
                pattern="-",
                message="クリックが0。入札・予算・審査状況を確認する。",
            )
        ]

    # 必要な改善倍率。ROASが0（CVなし）のときは無限大扱い。
    gap = safe_div(target_roas, expected_approved_roas) if expected_approved_roas > 0 else float("inf")

    levers = [
        (
            "AD_CTR",
            "広告CTR",
            ad_ctr,
            benchmarks.ad_ctr,
            "A",
            "KWと広告文の関連性・検索意図のズレ。広告見出しをKWクラスタに寄せる。",
        ),
        (
            "LP_TO_AFFILIATE_CTR",
            "LP→アフィCTR",
            lp_to_affiliate_ctr,
            benchmarks.lp_to_affiliate_ctr,
            "B",
            "FV・CTA・比較軸がLPの検索意図と噛み合っていない可能性が高い。",
        ),
        (
            "AFFILIATE_CVR",
            "アフィCVR",
            affiliate_cvr,
            benchmarks.affiliate_cvr,
            "C",
            "遷移前後の期待値ズレ。検索語句の質と広告主LPとの整合を見る。",
        ),
    ]

    found: List[Bottleneck] = []
    for code, label, current, bench, pattern, message in levers:
        if current >= bench:
            continue
        uplift = safe_div(bench, current) if current > 0 else float("inf")
        if gap == float("inf"):
            ratio = 0.0 if uplift == float("inf") else 0.0
        elif uplift == float("inf"):
            ratio = 1.0
        else:
            ratio = min(uplift, gap) / gap if gap > 1 else 1.0
        found.append(
            Bottleneck(
                code=code,
                label=label,
                current=round(current, 6),
                benchmark=bench,
                uplift=round(uplift, 4) if uplift != float("inf") else -1.0,
                gap_closed_ratio=round(ratio, 4),
                pattern=pattern,
                message=message,
            )
        )

    # パターンD: 各指標は健全なのに赤字 → CPCか成果単価の問題。
    if not found and expected_approved_roas < target_roas:
        found.append(
            Bottleneck(
                code="CPC_OR_PAYOUT_ECONOMICS",
                label="CPC/成果単価",
                current=round(expected_approved_roas, 6),
                benchmark=target_roas,
                uplift=round(gap, 4) if gap != float("inf") else -1.0,
                gap_closed_ratio=1.0,
                pattern="D",
                message="ファネル各段は健全。CPCが高すぎるか成果単価が不足している。入札上限を下げて再計算する。",
            )
        )

    # パターンE: 発生ROASは目標を超えるのに承認後は届かない。
    if actual_roas >= target_roas > expected_approved_roas:
        found.append(
            Bottleneck(
                code="APPROVAL_RATE",
                label="承認率",
                current=round(safe_div(expected_approved_roas, actual_roas), 6),
                benchmark=round(safe_div(target_roas, actual_roas), 6),
                uplift=round(safe_div(target_roas, expected_approved_roas), 4),
                gap_closed_ratio=1.0,
                pattern="E",
                message="発生成果は足りているが承認後に赤字。成果条件とのミスマッチ、ユーザー属性を疑う。",
            )
        )

    if conversions == 0 and affiliate_clicks > 0:
        found.append(
            Bottleneck(
                code="ZERO_CONVERSION",
                label="成果発生",
                current=0.0,
                benchmark=benchmarks.affiliate_cvr,
                uplift=-1.0,
                gap_closed_ratio=1.0,
                pattern="C",
                message="アフィクリックは出ているが成果0。計測連携（gclid引き継ぎ）とLP先の整合を先に確認する。",
            )
        )

    found.sort(key=lambda b: (b.gap_closed_ratio, b.uplift if b.uplift > 0 else 99), reverse=True)
    return found
