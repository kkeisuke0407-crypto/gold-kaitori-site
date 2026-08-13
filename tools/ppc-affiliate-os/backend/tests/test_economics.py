import unittest

from app.domain.economics import Decision, PreflightInput, calculate_preflight, compute_economics


class PreflightTests(unittest.TestCase):
    def test_spec_acceptance_case_1(self):
        """SPEC 20章 受入基準1: 8,500円 / CVR8% / LP CTR50% / ROAS150% → Target CPC 約226.67円"""
        result = calculate_preflight(
            PreflightInput(
                payout=8500,
                approval_rate=1.0,
                advertiser_cvr=0.08,
                target_roas=1.5,
                market_cpc=180,
                estimated_lp_ctr=0.50,
            )
        )
        self.assertAlmostEqual(result.affiliate_click_epc, 680.0, places=2)
        self.assertAlmostEqual(result.ad_click_epc, 340.0, places=2)
        self.assertAlmostEqual(result.break_even_cpc, 340.0, places=2)
        self.assertAlmostEqual(result.target_cpc, 226.6667, places=3)
        self.assertAlmostEqual(result.required_lp_ctr, 0.397059, places=5)
        self.assertAlmostEqual(result.cpc_headroom, 1.259259, places=5)
        self.assertEqual(result.decision, Decision.GO)

    def test_spec_acceptance_case_2_required_ctr_over_100(self):
        """受入基準2: 必要LP CTRが100%を超えるKWはNO-GO扱いできる"""
        result = calculate_preflight(
            PreflightInput(
                payout=4000,
                approval_rate=1.0,
                advertiser_cvr=0.02,
                target_roas=2.0,
                market_cpc=100,
                estimated_lp_ctr=0.50,
            )
        )
        self.assertGreater(result.required_lp_ctr, 1.0)
        self.assertEqual(result.decision, Decision.STOP)
        self.assertIn("REQUIRED_LP_CTR_OVER_100", result.reason_codes)

    def test_headroom_equals_lp_ctr_over_required_ctr(self):
        """CPC余裕率 = 想定LP CTR / 必要LP CTR という恒等式が成り立つこと"""
        result = calculate_preflight(
            PreflightInput(
                payout=6000,
                approval_rate=0.9,
                advertiser_cvr=0.05,
                target_roas=1.4,
                market_cpc=90,
                estimated_lp_ctr=0.42,
            )
        )
        self.assertAlmostEqual(result.cpc_headroom, 0.42 / result.required_lp_ctr, places=5)

    def test_low_confidence_downgrades_go_to_test(self):
        """CVRが推定値なら、基準シナリオが黒字でも弱気で赤字ならTESTに落とす"""
        args = dict(
            payout=8500,
            approval_rate=1.0,
            advertiser_cvr=0.08,
            target_roas=1.5,
            market_cpc=210,  # target_cpc 226.67 に対し基準では余裕率1.08
            estimated_lp_ctr=0.50,
        )
        confident = calculate_preflight(PreflightInput(advertiser_cvr_confidence=1.0, **args))
        uncertain = calculate_preflight(PreflightInput(advertiser_cvr_confidence=0.2, **args))
        self.assertEqual(confident.decision, Decision.GO)
        self.assertEqual(uncertain.decision, Decision.TEST)
        self.assertIn("BASE_OK_DOWNSIDE_RISK", uncertain.reason_codes)
        self.assertLess(uncertain.downside["cpc_headroom"], uncertain.base["cpc_headroom"])

    def test_confidence_one_means_all_scenarios_identical(self):
        result = calculate_preflight(
            PreflightInput(
                payout=5000,
                approval_rate=0.8,
                advertiser_cvr=0.06,
                target_roas=1.5,
                market_cpc=100,
                estimated_lp_ctr=0.5,
                advertiser_cvr_confidence=1.0,
            )
        )
        self.assertEqual(result.base, result.downside)
        self.assertEqual(result.base, result.upside)

    def test_monthly_profit_potential(self):
        """SPEC 8.7: 月間利益ポテンシャル = 見込クリック × (広告1クリック期待売上 - 市場CPC)"""
        result = calculate_preflight(
            PreflightInput(
                payout=8500,
                approval_rate=1.0,
                advertiser_cvr=0.08,
                target_roas=1.5,
                market_cpc=180,
                estimated_lp_ctr=0.50,
                expected_monthly_clicks=500,
            )
        )
        self.assertAlmostEqual(result.monthly_profit_potential, 500 * (340 - 180), places=2)

    def test_zero_payout_is_stop(self):
        result = calculate_preflight(
            PreflightInput(
                payout=0, approval_rate=1.0, advertiser_cvr=0.1,
                target_roas=1.5, market_cpc=100, estimated_lp_ctr=0.5,
            )
        )
        self.assertEqual(result.decision, Decision.STOP)
        self.assertIn("ZERO_EXPECTED_VALUE", result.reason_codes)

    def test_validation_rejects_out_of_range(self):
        with self.assertRaises(ValueError):
            calculate_preflight(
                PreflightInput(
                    payout=1000, approval_rate=1.5, advertiser_cvr=0.1,
                    target_roas=1.5, market_cpc=100, estimated_lp_ctr=0.5,
                )
            )
        with self.assertRaises(ValueError):
            calculate_preflight(
                PreflightInput(
                    payout=1000, approval_rate=1.0, advertiser_cvr=0.1,
                    target_roas=0, market_cpc=100, estimated_lp_ctr=0.5,
                )
            )


class EconomicsTests(unittest.TestCase):
    def test_break_even_cpc_equals_ad_click_epc(self):
        e = compute_economics(
            payout=10000, approval_rate=0.9, advertiser_cvr=0.05,
            target_roas=1.0, market_cpc=200, lp_ctr=0.4,
        )
        self.assertEqual(e.break_even_cpc, e.ad_click_epc)
        # target_roas=1.0 のとき上限CPC = 損益分岐CPC
        self.assertAlmostEqual(e.target_cpc, e.break_even_cpc, places=6)


if __name__ == "__main__":
    unittest.main()
