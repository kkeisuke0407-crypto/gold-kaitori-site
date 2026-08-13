import unittest

from app.db.store import Store


class OfferTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(":memory:")

    def test_create_and_get(self):
        offer = self.store.create_offer(
            {
                "name": "時計一括査定",
                "asp_name": "SLVRbullet",
                "payout": 8500,
                "approval_rate": 0.95,
                "advertiser_cvr": 0.08,
                "target_roas": 1.5,
                "rules": {"competitor_allowed": False, "negative_rules": ["無料", "求人"]},
            }
        )
        self.assertTrue(offer["id"])
        fetched = self.store.get_offer(offer["id"])
        self.assertEqual(fetched["name"], "時計一括査定")
        self.assertEqual(fetched["rules"]["negative_rules"], ["無料", "求人"])
        self.assertFalse(fetched["rules"]["competitor_allowed"])
        self.assertTrue(fetched["rules"]["listing_allowed"])

    def test_update(self):
        offer = self.store.create_offer({"name": "A", "payout": 1000, "advertiser_cvr": 0.05})
        updated = self.store.update_offer(offer["id"], {"payout": 2000, "status": "SCALE"})
        self.assertEqual(updated["payout"], 2000)
        self.assertEqual(updated["status"], "SCALE")

    def test_update_missing_offer_returns_none(self):
        self.assertIsNone(self.store.update_offer("nope", {"payout": 1}))

    def test_delete_cascades(self):
        offer = self.store.create_offer({"name": "A", "payout": 1000, "advertiser_cvr": 0.05})
        self.store.record_lp_click({"offer_id": offer["id"], "cta_name": "fv"})
        self.assertTrue(self.store.delete_offer(offer["id"]))
        self.assertIsNone(self.store.get_offer(offer["id"]))

    def test_defaults_when_rules_absent(self):
        offer = self.store.create_offer({"name": "A", "payout": 1000, "advertiser_cvr": 0.05})
        self.assertTrue(offer["rules"]["listing_allowed"])
        self.assertEqual(offer["rules"]["geo_rules"], [])


class TrackingTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(":memory:")
        self.offer = self.store.create_offer(
            {"name": "A", "payout": 8500, "advertiser_cvr": 0.08}
        )

    def test_record_and_count(self):
        """SPEC 20章 受入基準3: LP affiliate click を記録できる"""
        for i in range(3):
            self.store.record_lp_click(
                {
                    "offer_id": self.offer["id"],
                    "session_id": f"s{i}",
                    "gclid": f"g{i}",
                    "keyword": "ロレックス 買取",
                    "cta_name": "fv",
                }
            )
        self.assertEqual(self.store.count_lp_clicks(self.offer["id"]), 3)
        by_kw = self.store.lp_clicks_by_keyword(self.offer["id"])
        self.assertEqual(by_kw[0]["keyword"], "ロレックス 買取")
        self.assertEqual(by_kw[0]["affiliate_clicks"], 3)
        self.assertEqual(by_kw[0]["sessions"], 3)

    def test_survives_new_connection(self):
        self.store.record_lp_click({"offer_id": self.offer["id"]})
        self.assertEqual(self.store.count_lp_clicks(), 1)


class AdStatsTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(":memory:")
        self.offer = self.store.create_offer(
            {"name": "A", "payout": 8500, "advertiser_cvr": 0.08}
        )

    def test_upsert_is_idempotent(self):
        """SPEC 20章 受入基準4: KW別 cost/click/conversion を保存できる"""
        row = {
            "date": "2026-08-01", "offer_id": self.offer["id"],
            "campaign_id": "c1", "ad_group_id": "g1", "criterion_id": "k1",
            "keyword_text": "ロレックス 買取", "impressions": 100, "clicks": 10,
            "cost": 1500, "conversions": 1, "conversion_value": 8500,
        }
        self.store.upsert_ad_stats([row])
        self.store.upsert_ad_stats([{**row, "clicks": 12, "cost": 1800}])
        totals = self.store.offer_totals(self.offer["id"])
        self.assertEqual(totals["clicks"], 12)
        self.assertEqual(totals["cost"], 1800)

    def test_offer_totals_joins_affiliate_clicks(self):
        self.store.upsert_ad_stats(
            [{
                "date": "2026-08-01", "offer_id": self.offer["id"], "campaign_id": "c1",
                "ad_group_id": "g1", "criterion_id": "k1", "impressions": 1000,
                "clicks": 50, "cost": 7500, "conversions": 2, "conversion_value": 17000,
            }]
        )
        for i in range(20):
            self.store.record_lp_click({"offer_id": self.offer["id"], "session_id": f"s{i}"})
        totals = self.store.offer_totals(self.offer["id"])
        self.assertEqual(totals["clicks"], 50)
        self.assertEqual(totals["affiliate_clicks"], 20)

    def test_search_terms(self):
        self.store.upsert_search_terms(
            [{
                "date": "2026-08-01", "offer_id": self.offer["id"], "campaign_id": "c1",
                "ad_group_id": "g1", "search_term": "ろれっくす 買取 相場",
                "clicks": 5, "cost": 700,
            }]
        )
        with self.store.connection() as conn:
            n = conn.execute("SELECT COUNT(*) AS c FROM search_terms_daily").fetchone()["c"]
        self.assertEqual(n, 1)


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(":memory:")
        self.offer = self.store.create_offer(
            {"name": "A", "payout": 8500, "advertiser_cvr": 0.08, "approval_rate": 0.9}
        )

    def test_actual_rate_overrides_expectation(self):
        self.assertIsNone(self.store.actual_approval_rate(self.offer["id"]))
        self.store.record_approval(
            {"offer_id": self.offer["id"], "conversion_date": "2026-07-01",
             "count": 10, "approved_count": 7, "rejected_count": 3, "approved_revenue": 59500}
        )
        self.assertAlmostEqual(self.store.actual_approval_rate(self.offer["id"]), 0.7, places=6)


class DecisionLogTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(":memory:")

    def test_record_and_list(self):
        self.store.record_decision(
            "offer", "abc", "SCALE", ["ROAS_STRONG"], {"roas": 2.1}, {"budget": "+20%"}
        )
        rows = self.store.list_decisions("abc")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["decision"], "SCALE")
        self.assertEqual(rows[0]["reason_codes"], ["ROAS_STRONG"])
        self.assertEqual(rows[0]["metrics_snapshot"]["roas"], 2.1)


class KeywordPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(":memory:")
        self.offer = self.store.create_offer(
            {"name": "A", "payout": 8500, "advertiser_cvr": 0.08}
        )

    def test_upsert_by_normalized_keyword(self):
        rows = [
            {"keyword": "ロレックス 買取", "normalized_keyword": "ロレックス 買取",
             "bucket": "CORE", "priority_score": 80},
            {"keyword": "ＲＯＬＥＸ　買取", "normalized_keyword": "rolex 買取",
             "bucket": "OPPORTUNITY", "priority_score": 60},
        ]
        self.store.save_keyword_scores(self.offer["id"], rows)
        self.store.save_keyword_scores(
            self.offer["id"],
            [{"keyword": "ロレックス 買取", "normalized_keyword": "ロレックス 買取",
              "bucket": "OPPORTUNITY", "priority_score": 55}],
        )
        saved = self.store.list_keywords(self.offer["id"])
        self.assertEqual(len(saved), 2)
        self.assertEqual(saved[0]["priority_score"], 60)
        cores = self.store.list_keywords(self.offer["id"], bucket="CORE")
        self.assertEqual(cores, [])


if __name__ == "__main__":
    unittest.main()
