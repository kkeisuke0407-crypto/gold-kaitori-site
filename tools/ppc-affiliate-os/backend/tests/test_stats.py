import math
import unittest

from app.domain.stats import (
    beta_credible_interval,
    betainc,
    clicks_to_rule_out_rate,
    wilson_interval,
    zero_event_probability,
)


class BetaFunctionTests(unittest.TestCase):
    def test_betainc_matches_known_values(self):
        # I_x(1,1) = x （一様分布のCDF）
        for x in (0.1, 0.35, 0.5, 0.9):
            self.assertAlmostEqual(betainc(1, 1, x), x, places=8)
        # I_x(2,1) = x^2
        for x in (0.2, 0.6, 0.95):
            self.assertAlmostEqual(betainc(2, 1, x), x * x, places=8)
        # I_x(1,2) = 1-(1-x)^2
        for x in (0.2, 0.6):
            self.assertAlmostEqual(betainc(1, 2, x), 1 - (1 - x) ** 2, places=8)

    def test_betainc_bounds(self):
        self.assertEqual(betainc(3, 5, 0.0), 0.0)
        self.assertEqual(betainc(3, 5, 1.0), 1.0)

    def test_credible_interval_brackets_the_point_estimate(self):
        lo, hi = beta_credible_interval(5, 55, level=0.80)
        self.assertLess(lo, 5 / 55)
        self.assertGreater(hi, 5 / 55)
        self.assertGreater(lo, 0.0)
        self.assertLess(hi, 1.0)

    def test_more_data_narrows_the_interval(self):
        narrow = beta_credible_interval(50, 500, level=0.80)
        wide = beta_credible_interval(5, 50, level=0.80)
        self.assertLess(narrow[1] - narrow[0], wide[1] - wide[0])

    def test_zero_trials_is_fully_uncertain(self):
        self.assertEqual(beta_credible_interval(0, 0), (0.0, 1.0))


class ZeroEventTests(unittest.TestCase):
    def test_zero_probability(self):
        self.assertAlmostEqual(zero_event_probability(10, 0.1), 0.9**10, places=10)
        self.assertEqual(zero_event_probability(0, 0.5), 1.0)
        self.assertEqual(zero_event_probability(10, 0.0), 1.0)

    def test_clicks_needed_to_rule_out(self):
        # 5%のCVRを5%有意で棄却するには約58試行
        n = clicks_to_rule_out_rate(0.05, 0.05)
        self.assertAlmostEqual(n, math.log(0.05) / math.log(0.95), places=6)
        self.assertTrue(57 < n < 59)
        # 実際にその試行数でゼロ確率がalphaを下回る
        self.assertLess(zero_event_probability(math.ceil(n), 0.05), 0.05)

    def test_impossible_rate_returns_inf(self):
        self.assertEqual(clicks_to_rule_out_rate(0.0), float("inf"))


class WilsonTests(unittest.TestCase):
    def test_interval_contains_estimate(self):
        lo, hi = wilson_interval(50, 1000)
        self.assertLess(lo, 0.05)
        self.assertGreater(hi, 0.05)

    def test_zero_trials(self):
        self.assertEqual(wilson_interval(0, 0), (0.0, 1.0))


if __name__ == "__main__":
    unittest.main()
