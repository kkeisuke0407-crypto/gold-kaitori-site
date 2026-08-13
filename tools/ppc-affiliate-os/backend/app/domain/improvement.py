"""最小改善経路と改善実現性スコア（SPEC 13章）。MVPでは未実装だった部分。

「赤字だからSTOP」ではなく、損益分岐までに必要な改善幅をレバーごとに分解し、
どれが一番現実的かを出す。ここがこのツールの中核価値になる。

考え方:
  必要改善倍率 gap = target_roas / expected_approved_roas
  * 単独経路 : 1本のレバーだけで gap を埋める（そのレバーは gap 倍動く）
  * 均等経路 : k本のレバーが同時に gap^(1/k) 倍ずつ動く
  実現性は「そのレバーが相対的にどれだけ動きやすいか」の許容幅 tolerance で採点する。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from app.domain.economics import safe_div

__all__ = ["Lever", "ImprovementPath", "ImprovementPlan", "build_improvement_plan"]

# レバーごとの「相対変化の許容幅」。ここを1.0動かすのが実務的な限界感。
# CPCは入札と除外で比較的動かしやすく、広告主CVRは自分では動かせないので最も硬い。
_TOLERANCE = {
    "cpc": 0.25,
    "lp_to_affiliate_ctr": 0.50,
    "affiliate_cvr": 0.25,
    "ad_ctr": 0.60,
}

_LABEL = {
    "cpc": "CPC",
    "lp_to_affiliate_ctr": "LP→アフィCTR",
    "affiliate_cvr": "アフィCVR",
    "ad_ctr": "広告CTR",
}

# 自分で動かせるか。CVRは広告主側なので直接操作はできない（KW品質経由でのみ動く）。
_CONTROLLABLE = {
    "cpc": True,
    "lp_to_affiliate_ctr": True,
    "affiliate_cvr": False,
    "ad_ctr": True,
}


def _feasibility(relative_change: float, tolerance: float) -> float:
    """相対変化率から0〜100の実現性。tolerance と同じ幅で50点になる。"""
    if relative_change <= 0:
        return 100.0
    ratio = relative_change / tolerance
    return round(100.0 / (1.0 + ratio * ratio), 1)


@dataclass(frozen=True)
class Lever:
    key: str
    label: str
    current: float
    required: float
    # 相対変化率。CPCは「下げ幅」、他は「上げ幅」として常に正で表す。
    change_ratio: float
    direction: str
    feasibility: float
    controllable: bool

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ImprovementPath:
    name: str
    levers: List[Dict[str, Any]]
    feasibility: float
    description: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ImprovementPlan:
    required_gap: float
    reachable: bool
    feasibility_score: float
    evidence_level: float
    best_path: Optional[Dict[str, Any]]
    paths: List[Dict[str, Any]] = field(default_factory=list)
    levers: List[Dict[str, Any]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _evidence_level(clicks: int, conversions: float) -> float:
    """データ量の十分さ 0〜1。改善見込みの信頼度に掛ける。"""
    click_part = min(1.0, clicks / 300.0)
    cv_part = min(1.0, conversions / 5.0)
    return round(0.5 * click_part + 0.5 * cv_part, 4)


def build_improvement_plan(
    *,
    target_roas: float,
    expected_approved_roas: float,
    actual_cpc: float,
    lp_to_affiliate_ctr: float,
    affiliate_cvr: float,
    ad_ctr: float,
    clicks: int,
    conversions: float,
    market_cpc_floor: Optional[float] = None,
) -> ImprovementPlan:
    """損益分岐に必要な改善幅を分解し、最も現実的な経路を返す。"""
    notes: List[str] = []

    if expected_approved_roas <= 0:
        return ImprovementPlan(
            required_gap=float("inf"),
            reachable=False,
            feasibility_score=0.0,
            evidence_level=_evidence_level(clicks, conversions),
            best_path=None,
            notes=["成果が0のため改善倍率を計算できない。まず1件の成果を出せるかを見る。"],
        )

    gap = safe_div(target_roas, expected_approved_roas)
    if gap <= 1.0:
        return ImprovementPlan(
            required_gap=round(gap, 4),
            reachable=True,
            feasibility_score=100.0,
            evidence_level=_evidence_level(clicks, conversions),
            best_path=None,
            notes=["すでに目標ROASを満たしている。改善経路の算出は不要。"],
        )

    raw = {
        "cpc": actual_cpc,
        "lp_to_affiliate_ctr": lp_to_affiliate_ctr,
        "affiliate_cvr": affiliate_cvr,
        "ad_ctr": ad_ctr,
    }

    def make_lever(key: str, factor: float) -> Optional[Lever]:
        current = raw[key]
        if current <= 0:
            return None
        if key == "cpc":
            required = current / factor
            change = 1.0 - safe_div(required, current)
            direction = "down"
        else:
            required = current * factor
            if required > 1.0:
                # CTR/CVRは100%を超えられない = この経路は成立しない
                return Lever(
                    key=key,
                    label=_LABEL[key],
                    current=round(current, 6),
                    required=round(required, 6),
                    change_ratio=round(factor - 1.0, 6),
                    direction="up",
                    feasibility=0.0,
                    controllable=_CONTROLLABLE[key],
                )
            change = factor - 1.0
            direction = "up"

        feasibility = _feasibility(abs(change), _TOLERANCE[key])
        if key == "cpc" and market_cpc_floor and required < market_cpc_floor:
            # 市場の下限入札を割り込む要求は実現不能に近い
            feasibility = min(feasibility, 5.0)
        return Lever(
            key=key,
            label=_LABEL[key],
            current=round(current, 6),
            required=round(required, 6),
            change_ratio=round(abs(change), 6),
            direction=direction,
            feasibility=feasibility,
            controllable=_CONTROLLABLE[key],
        )

    single_levers = [lv for lv in (make_lever(k, gap) for k in raw) if lv is not None]

    paths: List[ImprovementPath] = []
    for lv in single_levers:
        paths.append(
            ImprovementPath(
                name=f"{lv.label}単独",
                levers=[lv.to_dict()],
                feasibility=lv.feasibility,
                description=(
                    f"{lv.label}を{lv.current:.4g}→{lv.required:.4g}"
                    f"（{lv.change_ratio * 100:.1f}%{'削減' if lv.direction == 'down' else '改善'}）"
                ),
            )
        )

    # 自分で動かせるレバーだけを使った均等分散経路
    controllable_keys = [k for k in ("cpc", "lp_to_affiliate_ctr", "ad_ctr") if raw[k] > 0]
    for size in (2, 3):
        if len(controllable_keys) < size:
            continue
        keys = controllable_keys[:size]
        factor = gap ** (1.0 / size)
        combo = [make_lever(k, factor) for k in keys]
        if any(lv is None for lv in combo):
            continue
        combo_levers = [lv for lv in combo if lv is not None]
        paths.append(
            ImprovementPath(
                name=" + ".join(lv.label for lv in combo_levers) + "（同時改善）",
                levers=[lv.to_dict() for lv in combo_levers],
                feasibility=round(min(lv.feasibility for lv in combo_levers), 1),
                description="／".join(
                    f"{lv.label} {lv.change_ratio * 100:.1f}%"
                    f"{'削減' if lv.direction == 'down' else '改善'}"
                    for lv in combo_levers
                ),
            )
        )

    paths.sort(key=lambda p: p.feasibility, reverse=True)
    best = paths[0] if paths else None
    evidence = _evidence_level(clicks, conversions)

    if best is None:
        notes.append("有効な改善レバーが見つからない。構造的に赤字の可能性が高い。")
        score = 0.0
    else:
        # データが薄いうちは「まだ分からない」を素直に反映して極端な結論を避ける
        score = round(best.feasibility * (0.6 + 0.4 * evidence), 1)
        if evidence < 0.5:
            notes.append("データ量が不足しているため、実現性スコアは暫定値。テストを継続して再評価する。")
        if best.feasibility < 20:
            notes.append("最も現実的な経路でも要求改善幅が大きい。撤退を第一候補に置くべき水準。")

    uncontrollable = [lv for lv in single_levers if not lv.controllable and lv.feasibility > 0]
    if uncontrollable and best and best.levers and not best.levers[0].get("controllable", True):
        notes.append("最有力レバーが広告主側の指標。自分では直接動かせないため、KW品質の入替で間接的に狙う。")

    return ImprovementPlan(
        required_gap=round(gap, 4),
        reachable=bool(best and best.feasibility > 0),
        feasibility_score=score,
        evidence_level=evidence,
        best_path=best.to_dict() if best else None,
        paths=[p.to_dict() for p in paths],
        levers=[lv.to_dict() for lv in single_levers],
        notes=notes,
    )
