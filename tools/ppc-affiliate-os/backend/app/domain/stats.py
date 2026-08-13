"""小標本の統計判定（標準ライブラリのみ）。

PPCアフィリエイトの意思決定でいちばん危険なのは「CV3件で黒字に見えたのでSCALE」
「CV0が30クリック続いたのでSTOP」という、偶然と実力を取り違える判断。
ここでは外部依存なしにベイズ信用区間とゼロ事象の検定を実装し、
decision_engine から「証拠として足りているか」を数値で問えるようにする。

数式はすべてコード側に置き、AIには一切依存しない（SPEC 22.2）。
"""
from __future__ import annotations

import math
from typing import Tuple

__all__ = [
    "log_beta",
    "betainc",
    "beta_ppf",
    "beta_credible_interval",
    "zero_event_probability",
    "clicks_to_rule_out_rate",
    "wilson_interval",
]

_LANCZOS = (
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
)


def _log_gamma(x: float) -> float:
    """Lanczos近似による log Γ(x)。x > 0 を前提とする。"""
    if x < 0.5:
        # 反射公式。x <= 0 はこの関数の利用範囲では発生しない。
        return math.log(math.pi / abs(math.sin(math.pi * x))) - _log_gamma(1.0 - x)
    x -= 1.0
    a = 0.99999999999980993
    t = x + 7.5
    for i, c in enumerate(_LANCZOS):
        a += c / (x + i + 1)
    return 0.5 * math.log(2 * math.pi) + (x + 0.5) * math.log(t) - t + math.log(a)


def log_beta(a: float, b: float) -> float:
    return _log_gamma(a) + _log_gamma(b) - _log_gamma(a + b)


def _betacf(a: float, b: float, x: float, max_iter: int = 300, eps: float = 1e-12) -> float:
    """正則化不完全ベータ関数の連分数展開（Numerical Recipes の modified Lentz 法）。"""
    tiny = 1e-30
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def betainc(a: float, b: float, x: float) -> float:
    """正則化不完全ベータ関数 I_x(a, b)。= Beta(a, b) の累積分布関数。"""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    front = math.exp(a * math.log(x) + b * math.log1p(-x) - log_beta(a, b))
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - math.exp(
        b * math.log1p(-x) + a * math.log(x) - log_beta(a, b)
    ) * _betacf(b, a, 1.0 - x) / b


def beta_ppf(a: float, b: float, q: float) -> float:
    """Beta(a, b) の分位点。CDF の単調性を使った二分法（依存を増やさないため）。"""
    if q <= 0.0:
        return 0.0
    if q >= 1.0:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2.0
        if betainc(a, b, mid) < q:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def beta_credible_interval(
    successes: float,
    trials: float,
    level: float = 0.80,
    prior_a: float = 1.0,
    prior_b: float = 1.0,
) -> Tuple[float, float]:
    """成功率のベイズ信用区間。

    事前分布は Beta(1, 1)（一様）を既定にする。CV数が少ないほど区間が広がるので、
    「下限でも目標ROASを超えるか」を SCALE の条件にすれば運が良かっただけの案件を弾ける。

    level=0.80 なら 10%〜90% 区間（片側10%が実質の下限保証）。
    """
    if trials <= 0:
        return (0.0, 1.0)
    successes = max(0.0, min(successes, trials))
    a = prior_a + successes
    b = prior_b + (trials - successes)
    tail = (1.0 - level) / 2.0
    return (beta_ppf(a, b, tail), beta_ppf(a, b, 1.0 - tail))


def zero_event_probability(trials: float, rate: float) -> float:
    """真の発生率が `rate` のとき、`trials` 回試して0件になる確率 (1-p)^n。

    「CV0だから撤退」ではなく「損益分岐に必要なCVRが本当なら、
    ここまで0件が続く確率は◯%しかない」と言うための材料。
    """
    if trials <= 0:
        return 1.0
    if rate <= 0.0:
        return 1.0
    if rate >= 1.0:
        return 0.0
    return math.exp(trials * math.log1p(-rate))


def clicks_to_rule_out_rate(rate: float, alpha: float = 0.05) -> float:
    """発生率 `rate` を有意水準 `alpha` で棄却するのに必要な試行数（CV0前提）。

    テスト予算を決めるときの「最低これだけは回さないと判断できない」ライン。
    """
    if rate <= 0.0 or rate >= 1.0:
        return float("inf")
    return math.log(alpha) / math.log1p(-rate)


def wilson_interval(successes: float, trials: float, z: float = 1.6449) -> Tuple[float, float]:
    """Wilson score 区間（既定 z=1.6449 は90%両側）。CTRなど試行数が多い指標向け。"""
    if trials <= 0:
        return (0.0, 1.0)
    p = successes / trials
    z2 = z * z
    denom = 1.0 + z2 / trials
    center = (p + z2 / (2 * trials)) / denom
    margin = (z * math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials))) / denom
    return (max(0.0, center - margin), min(1.0, center + margin))
