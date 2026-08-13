import unittest

from app.domain.improvement import build_improvement_plan


def plan(**overrides):
    args = dict(
        target_roas=1.5,
        expected_approved_roas=1.2,
        actual_cpc=210.0,
        lp_to_affiliate_ctr=0.28,
        affiliate_cvr=0.07,
        ad_ctr=0.05,
        clicks=400,
        conversions=8,
    )
    args.update(overrides)
    return build_improvement_plan(**args)


class GapTests(unittest.TestCase):
    def test_required_gap(self):
        p = plan()
        self.assertAlmostEqual(p.required_gap, 1.25, places=4)

    def test_single_lever_requirements_match_spec_example(self):
        """SPEC 13章の例: CPCは gap 分だけ下げ、CTR/CVRは gap 倍に上げる必要がある"""
        p = plan()
        levers = {lv["key"]: lv for lv in p.levers}
        self.assertAlmostEqual(levers["cpc"]["required"], 210.0 / 1.25, places=3)
        self.assertAlmostEqual(levers["lp_to_affiliate_ctr"]["required"], 0.28 * 1.25, places=5)
        self.assertAlmostEqual(levers["affiliate_cvr"]["required"], 0.07 * 1.25, places=5)
        self.assertEqual(levers["cpc"]["direction"], "down")
        self.assertEqual(levers["lp_to_affiliate_ctr"]["direction"], "up")

    def test_already_meeting_target(self):
        p = plan(expected_approved_roas=2.0)
        self.assertTrue(p.reachable)
        self.assertEqual(p.feasibility_score, 100.0)
        self.assertIsNone(p.best_path)

    def test_zero_roas_is_not_computable(self):
        p = plan(expected_approved_roas=0.0, conversions=0)
        self.assertFalse(p.reachable)
        self.assertEqual(p.feasibility_score, 0.0)
        self.assertEqual(p.required_gap, float("inf"))


class FeasibilityTests(unittest.TestCase):
    def test_small_gap_is_more_feasible_than_large_gap(self):
        easy = plan(expected_approved_roas=1.45)
        hard = plan(expected_approved_roas=0.4)
        self.assertGreater(easy.feasibility_score, hard.feasibility_score)

    def test_ctr_above_100_percent_is_infeasible(self):
        p = plan(expected_approved_roas=0.2, lp_to_affiliate_ctr=0.9)
        lp = next(lv for lv in p.levers if lv["key"] == "lp_to_affiliate_ctr")
        self.assertGreater(lp["required"], 1.0)
        self.assertEqual(lp["feasibility"], 0.0)

    def test_market_cpc_floor_kills_impossible_cpc_path(self):
        without = plan(expected_approved_roas=0.9)
        with_floor = plan(expected_approved_roas=0.9, market_cpc_floor=200.0)
        cpc_a = next(lv for lv in without.levers if lv["key"] == "cpc")
        cpc_b = next(lv for lv in with_floor.levers if lv["key"] == "cpc")
        self.assertLess(cpc_b["feasibility"], cpc_a["feasibility"])

    def test_combined_path_is_easier_than_any_single_lever(self):
        p = plan(expected_approved_roas=0.75)  # gap 2.0
        combined = [x for x in p.paths if "同時改善" in x["name"]]
        self.assertTrue(combined)
        best_single = max(
            x["feasibility"] for x in p.paths if "同時改善" not in x["name"]
        )
        self.assertGreaterEqual(max(c["feasibility"] for c in combined), best_single)

    def test_thin_data_discounts_the_score(self):
        thin = plan(clicks=20, conversions=1)
        thick = plan(clicks=1000, conversions=30)
        self.assertLess(thin.evidence_level, thick.evidence_level)
        self.assertLess(thin.feasibility_score, thick.feasibility_score)
        self.assertTrue(any("データ量が不足" in n for n in thin.notes))

    def test_affiliate_cvr_is_marked_uncontrollable(self):
        p = plan()
        cvr = next(lv for lv in p.levers if lv["key"] == "affiliate_cvr")
        self.assertFalse(cvr["controllable"])
        cpc = next(lv for lv in p.levers if lv["key"] == "cpc")
        self.assertTrue(cpc["controllable"])


if __name__ == "__main__":
    unittest.main()
