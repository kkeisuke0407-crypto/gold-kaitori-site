import unittest

from app.domain.decision_engine import Decision, RuntimeInput, evaluate_runtime


def base_input(**overrides) -> RuntimeInput:
    args = dict(
        impressions=2000,
        clicks=100,
        cost=15000,
        affiliate_clicks=55,
        conversions=5,
        conversion_value=42500,
        approval_rate=0.95,
        target_roas=1.5,
        max_test_budget=50000,
        min_test_clicks=50,
        stop_after_zero_cv_clicks=200,
    )
    args.update(overrides)
    return RuntimeInput(**args)


class ScaleTests(unittest.TestCase):
    def test_scale_when_evidence_is_strong(self):
        """SPEC 20章 受入基準8: 黒字かつCV数十分ならSCALE候補を返せる"""
        result = evaluate_runtime(base_input())
        self.assertEqual(result.decision, Decision.SCALE)
        self.assertAlmostEqual(result.lp_to_affiliate_ctr, 0.55, places=3)
        self.assertAlmostEqual(result.actual_roas, 42500 / 15000, places=4)
        self.assertIn("CREDIBLE_LOWER_BOUND_ABOVE_TARGET", result.reason_codes)
        self.assertIsNotNone(result.budget_suggestion)
        self.assertGreater(result.budget_suggestion["daily_budget_change_pct"], 0)

    def test_credible_lower_bound_gates_scale(self):
        """点推定は強いが証拠が薄い（CV3件）ならSCALEせずKEEPに留める"""
        result = evaluate_runtime(
            base_input(conversions=3, conversion_value=25500, cost=8000, affiliate_clicks=55)
        )
        self.assertGreaterEqual(result.actual_roas, 1.5 * 1.2)
        self.assertLess(result.roas_credible_low, result.actual_roas)
        self.assertIn(result.decision, (Decision.SCALE, Decision.KEEP))
        if result.decision == Decision.KEEP:
            self.assertIn("STRONG_POINT_ESTIMATE_WEAK_EVIDENCE", result.reason_codes)

    def test_more_conversions_tightens_the_bound(self):
        few = evaluate_runtime(base_input(conversions=5, conversion_value=42500))
        many = evaluate_runtime(
            base_input(
                clicks=1000, cost=150000, affiliate_clicks=550,
                conversions=50, conversion_value=425000, impressions=20000,
            )
        )
        self.assertAlmostEqual(few.actual_roas, many.actual_roas, places=4)
        self.assertGreater(many.roas_credible_low, few.roas_credible_low)


class StopTests(unittest.TestCase):
    def test_stop_when_budget_exceeded_with_zero_cv(self):
        """SPEC 20章 受入基準7: 最大テスト予算を超えCV0ならSTOP"""
        result = evaluate_runtime(
            base_input(
                impressions=3000, clicks=220, cost=50000,
                affiliate_clicks=80, conversions=0, conversion_value=0,
                approval_rate=0.9, min_test_clicks=100,
            )
        )
        self.assertEqual(result.decision, Decision.STOP)
        self.assertIn("MAX_TEST_BUDGET_EXCEEDED_ZERO_CV", result.reason_codes)

    def test_statistical_zero_cv_stop(self):
        """payoutを渡すと、必要CVRに対する連続ゼロの確率で撤退を根拠づける"""
        result = evaluate_runtime(
            base_input(
                clicks=400, cost=40000, affiliate_clicks=300,
                conversions=0, conversion_value=0,
                max_test_budget=0, stop_after_zero_cv_clicks=0,
                min_test_clicks=50, payout=8500, approval_rate=1.0,
            )
        )
        self.assertEqual(result.decision, Decision.STOP)
        self.assertIn("ZERO_CV_STATISTICALLY_SIGNIFICANT", result.reason_codes)
        zero = result.evidence["zero_cv"]
        self.assertTrue(zero["applicable"])
        self.assertLess(zero["p_zero_given_required"], 0.05)

    def test_no_statistical_stop_when_sample_is_small(self):
        """同じCV0でもサンプルが小さければ撤退しない（早すぎる見切りを防ぐ）"""
        result = evaluate_runtime(
            base_input(
                clicks=60, cost=6000, affiliate_clicks=20,
                conversions=0, conversion_value=0,
                max_test_budget=0, stop_after_zero_cv_clicks=0,
                min_test_clicks=50, payout=8500, approval_rate=1.0,
            )
        )
        self.assertNotIn("ZERO_CV_STATISTICALLY_SIGNIFICANT", result.reason_codes)
        self.assertNotEqual(result.decision, Decision.STOP)

    def test_zero_cv_click_limit(self):
        result = evaluate_runtime(
            base_input(
                clicks=250, cost=10000, affiliate_clicks=90,
                conversions=0, conversion_value=0,
                max_test_budget=0, stop_after_zero_cv_clicks=200, min_test_clicks=50,
            )
        )
        self.assertEqual(result.decision, Decision.STOP)
        self.assertIn("ZERO_CV_CLICK_LIMIT_EXCEEDED", result.reason_codes)


class TestPhaseTests(unittest.TestCase):
    def test_test_when_data_is_thin(self):
        result = evaluate_runtime(base_input(clicks=20, min_test_clicks=100))
        self.assertEqual(result.decision, Decision.TEST)
        self.assertIn("INSUFFICIENT_CLICK_DATA", result.reason_codes)


class ImproveTests(unittest.TestCase):
    def test_improve_when_gap_is_small(self):
        result = evaluate_runtime(
            base_input(
                cost=30000, conversions=5, conversion_value=42500,
                approval_rate=0.95, target_roas=1.5,
            )
        )
        self.assertLess(result.expected_approved_roas, 1.5)
        self.assertEqual(result.decision, Decision.IMPROVE)
        self.assertGreater(result.improvement["feasibility_score"], 0)
        self.assertIsNotNone(result.improvement["best_path"])

    def test_stop_when_gap_is_hopeless(self):
        result = evaluate_runtime(
            base_input(
                cost=300000, conversions=5, conversion_value=42500,
                approval_rate=0.95, target_roas=1.5, min_test_clicks=10,
            )
        )
        self.assertEqual(result.decision, Decision.STOP)
        self.assertIn("IMPROVEMENT_INFEASIBLE", result.reason_codes)

    def test_keep_when_target_met(self):
        result = evaluate_runtime(
            base_input(cost=26000, conversions=5, conversion_value=42500)
        )
        self.assertGreaterEqual(result.expected_approved_roas, 1.5)
        self.assertIn(result.decision, (Decision.KEEP, Decision.SCALE))


class MetricTests(unittest.TestCase):
    def test_funnel_metrics(self):
        """SPEC 20章 受入基準6: 実績からLP CTR・アフィCVR・ROASを算出できる"""
        result = evaluate_runtime(base_input())
        self.assertAlmostEqual(result.ad_ctr, 100 / 2000, places=6)
        self.assertAlmostEqual(result.actual_cpc, 15000 / 100, places=4)
        self.assertAlmostEqual(result.lp_to_affiliate_ctr, 55 / 100, places=6)
        self.assertAlmostEqual(result.affiliate_cvr, 5 / 55, places=6)
        self.assertAlmostEqual(result.ad_to_final_cvr, 5 / 100, places=6)
        self.assertAlmostEqual(result.expected_approved_revenue, 42500 * 0.95, places=2)
        self.assertAlmostEqual(result.profit, 42500 * 0.95 - 15000, places=2)
        self.assertAlmostEqual(result.value_per_conversion, 8500, places=2)

    def test_no_traffic(self):
        result = evaluate_runtime(
            base_input(impressions=0, clicks=0, cost=0, affiliate_clicks=0,
                       conversions=0, conversion_value=0, min_test_clicks=100)
        )
        self.assertEqual(result.bottleneck, "NO_TRAFFIC")
        self.assertEqual(result.decision, Decision.TEST)

    def test_bottleneck_ranking_prefers_lp_ctr(self):
        result = evaluate_runtime(
            base_input(
                clicks=200, cost=40000, affiliate_clicks=20,  # LP CTR 10%
                conversions=2, conversion_value=17000, impressions=4000,
            )
        )
        self.assertEqual(result.bottleneck, "LP_TO_AFFILIATE_CTR")
        self.assertTrue(result.bottlenecks)
        self.assertGreaterEqual(result.bottlenecks[0]["gap_closed_ratio"], 0.0)

    def test_validation(self):
        with self.assertRaises(ValueError):
            evaluate_runtime(base_input(clicks=-1))
        with self.assertRaises(ValueError):
            evaluate_runtime(base_input(target_roas=0))
        with self.assertRaises(ValueError):
            evaluate_runtime(base_input(approval_rate=2))


if __name__ == "__main__":
    unittest.main()
