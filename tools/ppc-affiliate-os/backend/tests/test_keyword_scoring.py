import unittest

from app.domain.keyword_scoring import (
    KeywordInput,
    OfferEconomics,
    aggregate_clusters,
    normalize_keyword,
    score_keyword,
    score_keywords,
)

OFFER = OfferEconomics(payout=8500, approval_rate=1.0, advertiser_cvr=0.08, target_roas=1.5)


class NormalizeTests(unittest.TestCase):
    def test_width_and_case_and_space(self):
        self.assertEqual(normalize_keyword("ＲＯＬＥＸ　買取"), "rolex 買取")
        self.assertEqual(normalize_keyword("  時計   買取  "), "時計 買取")
        self.assertEqual(normalize_keyword("ﾛﾚｯｸｽ"), "ロレックス")
        self.assertEqual(normalize_keyword(""), "")


class BucketTests(unittest.TestCase):
    def test_core(self):
        s = score_keyword(
            KeywordInput(
                keyword="ロレックス 買取 相場",
                avg_monthly_searches=2400,
                forecast_cpc=180,
                commercial_intent=85,
                estimated_lp_ctr=0.5,
                ai_confidence=0.8,
            ),
            OFFER,
        )
        self.assertEqual(s.bucket, "CORE")
        self.assertGreater(s.cpc_headroom, 1.0)
        self.assertGreater(s.priority_score, 0)

    def test_exclude_when_required_ctr_impossible(self):
        s = score_keyword(
            KeywordInput(keyword="腕時計", forecast_cpc=500, estimated_lp_ctr=0.2), OFFER
        )
        self.assertEqual(s.bucket, "EXCLUDE")
        self.assertGreater(s.required_lp_ctr, 1.0)
        self.assertEqual(s.priority_score, 0.0)

    def test_rule_block_wins_over_economics(self):
        s = score_keyword(
            KeywordInput(
                keyword="競合ブランド 買取",
                forecast_cpc=50,
                commercial_intent=95,
                estimated_lp_ctr=0.6,
                blocked_by_rule=True,
                blocked_reason="競合KW不可",
            ),
            OFFER,
        )
        self.assertEqual(s.bucket, "EXCLUDE")
        self.assertIn("競合KW不可", s.reasons[0])

    def test_high_noise_is_excluded(self):
        s = score_keyword(
            KeywordInput(
                keyword="時計 無料", forecast_cpc=30, commercial_intent=70,
                noise_risk=90, estimated_lp_ctr=0.5,
            ),
            OFFER,
        )
        self.assertEqual(s.bucket, "EXCLUDE")

    def test_missing_cpc_becomes_discovery(self):
        s = score_keyword(KeywordInput(keyword="新規語", estimated_lp_ctr=0.4), OFFER)
        self.assertEqual(s.bucket, "DISCOVERY")

    def test_low_confidence_becomes_discovery(self):
        s = score_keyword(
            KeywordInput(
                keyword="時計 処分 方法", avg_monthly_searches=260, forecast_cpc=280,
                commercial_intent=45, estimated_lp_ctr=0.45, ai_confidence=0.3,
            ),
            OFFER,
        )
        self.assertEqual(s.bucket, "DISCOVERY")


class MarketCpcTests(unittest.TestCase):
    def test_bid_range_leans_toward_the_high_bid(self):
        s = score_keyword(
            KeywordInput(keyword="k", low_bid=100, high_bid=200, estimated_lp_ctr=0.5), OFFER
        )
        self.assertAlmostEqual(s.market_cpc, 160.0, places=2)

    def test_forecast_cpc_wins(self):
        s = score_keyword(
            KeywordInput(keyword="k", low_bid=100, high_bid=200, forecast_cpc=130,
                         estimated_lp_ctr=0.5),
            OFFER,
        )
        self.assertAlmostEqual(s.market_cpc, 130.0, places=2)

    def test_competition_reduces_expected_clicks(self):
        easy = score_keyword(
            KeywordInput(keyword="a", avg_monthly_searches=1000, competition_index=0,
                         forecast_cpc=100, estimated_lp_ctr=0.5),
            OFFER,
        )
        hard = score_keyword(
            KeywordInput(keyword="b", avg_monthly_searches=1000, competition_index=100,
                         forecast_cpc=100, estimated_lp_ctr=0.5),
            OFFER,
        )
        self.assertGreater(easy.expected_monthly_clicks, hard.expected_monthly_clicks)


class ClusterTests(unittest.TestCase):
    def test_longtail_cluster_is_evaluated_as_a_group(self):
        """SPEC 22.3: 検索数0〜10を捨てず、クラスタ単位で市場性を見る"""
        keywords = [
            KeywordInput(
                keyword=f"運送業 資金繰り {i}", avg_monthly_searches=10,
                forecast_cpc=100, commercial_intent=75, estimated_lp_ctr=0.5,
                ai_confidence=0.7, cluster="運送業資金不足",
            )
            for i in range(12)
        ]
        keywords.append(
            KeywordInput(
                keyword="腕時計", avg_monthly_searches=90000, forecast_cpc=600,
                commercial_intent=20, estimated_lp_ctr=0.2, cluster="一般語",
            )
        )
        scores = score_keywords(keywords, OFFER)
        clusters = aggregate_clusters(scores)
        by_name = {c["cluster"]: c for c in clusters}

        self.assertEqual(by_name["運送業資金不足"]["keyword_count"], 12)
        self.assertGreater(by_name["運送業資金不足"]["expected_monthly_profit"], 0)
        # 単体では小さいが、束ねればクリック見込みがまとまった数になる
        self.assertGreater(by_name["運送業資金不足"]["expected_monthly_clicks"], 4)
        # 検索数が桁違いに大きい一般語でも、採算が合わなければ利益はプラスにならない
        self.assertLessEqual(by_name["一般語"]["expected_monthly_profit"], 0)
        # 利益順に並ぶ
        self.assertEqual(clusters[0]["cluster"], "運送業資金不足")

    def test_sorted_by_priority(self):
        scores = score_keywords(
            [
                KeywordInput(keyword="低", forecast_cpc=400, estimated_lp_ctr=0.3,
                             commercial_intent=20, avg_monthly_searches=100),
                KeywordInput(keyword="高", forecast_cpc=100, estimated_lp_ctr=0.6,
                             commercial_intent=90, avg_monthly_searches=3000,
                             ai_confidence=0.9),
            ],
            OFFER,
        )
        self.assertEqual(scores[0].keyword, "高")


if __name__ == "__main__":
    unittest.main()
