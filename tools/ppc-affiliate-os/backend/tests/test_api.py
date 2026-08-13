"""APIの結線テスト。fastapi/httpx が無い環境ではスキップする。"""
import io
import unittest

try:
    from fastapi.testclient import TestClient

    HAS_FASTAPI = True
except Exception:  # pragma: no cover - 依存未インストール環境
    HAS_FASTAPI = False


@unittest.skipUnless(HAS_FASTAPI, "fastapi/httpx が未インストール")
class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.api import deps
        from app.db.store import Store
        from app.main import app

        deps.reset_store_for_tests(Store(":memory:"))
        cls.client = TestClient(app)

    def setUp(self):
        from app.api import deps

        deps.get_tracking_limiter().reset()

    # ---------------- meta ----------------

    def test_health(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")
        self.assertEqual(r.json()["version"], "0.2.0")

    # ---------------- decision ----------------

    def test_preflight(self):
        r = self.client.post(
            "/api/v1/decision/preflight",
            json={
                "payout": 8500, "approval_rate": 1.0, "advertiser_cvr": 0.08,
                "target_roas": 1.5, "market_cpc": 180, "estimated_lp_ctr": 0.5,
            },
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertAlmostEqual(body["target_cpc"], 226.6667, places=3)
        self.assertEqual(body["decision"], "GO")
        self.assertIn("downside", body)

    def test_preflight_validation(self):
        r = self.client.post(
            "/api/v1/decision/preflight",
            json={
                "payout": 8500, "approval_rate": 5.0, "advertiser_cvr": 0.08,
                "target_roas": 1.5, "market_cpc": 180, "estimated_lp_ctr": 0.5,
            },
        )
        self.assertEqual(r.status_code, 422)

    def test_runtime(self):
        r = self.client.post(
            "/api/v1/decision/runtime",
            json={
                "impressions": 2000, "clicks": 100, "cost": 15000,
                "affiliate_clicks": 55, "conversions": 5, "conversion_value": 42500,
                "approval_rate": 0.95, "target_roas": 1.5, "max_test_budget": 50000,
                "min_test_clicks": 50, "stop_after_zero_cv_clicks": 200,
            },
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["decision"], "SCALE")
        self.assertIn("bottlenecks", body)
        self.assertIn("improvement", body)
        self.assertIsNotNone(body["budget_suggestion"])

    # ---------------- offers ----------------

    def _create_offer(self, **overrides):
        payload = {
            "name": "時計一括査定", "asp_name": "SLVRbullet", "payout": 8500,
            "approval_rate": 0.95, "advertiser_cvr": 0.08, "target_roas": 1.5,
            "max_test_budget": 50000, "min_test_clicks": 50,
            "stop_after_zero_cv_clicks": 200,
            "rules": {"competitor_allowed": False, "negative_rules": ["求人"]},
        }
        payload.update(overrides)
        r = self.client.post("/api/v1/offers", json=payload)
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def test_offer_crud(self):
        offer = self._create_offer(name="CRUD案件")
        offer_id = offer["id"]

        r = self.client.get(f"/api/v1/offers/{offer_id}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["rules"]["negative_rules"], ["求人"])

        r = self.client.patch(f"/api/v1/offers/{offer_id}", json={"payout": 9000})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["payout"], 9000)

        r = self.client.get("/api/v1/offers")
        self.assertTrue(any(o["id"] == offer_id for o in r.json()["offers"]))

        r = self.client.delete(f"/api/v1/offers/{offer_id}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/offers/{offer_id}").status_code, 404)

    def test_offer_setup_returns_tags(self):
        offer = self._create_offer(name="タグ確認")
        r = self.client.get(f"/api/v1/offers/{offer['id']}/setup")
        self.assertEqual(r.status_code, 200)
        checklist = r.json()["checklist"]
        self.assertEqual(len(checklist), 4)
        self.assertIn("slvrbullet", checklist[0]["code"])
        self.assertIn(offer["id"], checklist[1]["code"])

    # ---------------- tracking ----------------

    def test_tracking_and_funnel(self):
        offer = self._create_offer(name="計測案件")
        for i in range(3):
            r = self.client.post(
                "/api/v1/tracking/affiliate-click",
                json={
                    "offer_id": offer["id"], "session_id": f"s{i}",
                    "gclid": f"g{i}", "keyword": "ロレックス 買取", "cta_name": "fv_hero",
                },
            )
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json()["accepted"])

        r = self.client.get(f"/api/v1/offers/{offer['id']}/funnel")
        self.assertEqual(r.json()["totals"]["affiliate_clicks"], 3)
        self.assertEqual(r.json()["by_keyword"][0]["keyword"], "ロレックス 買取")

    def test_tracking_rate_limit(self):
        from app.api import deps

        offer = self._create_offer(name="レート制限")
        limiter = deps.get_tracking_limiter()
        limiter.reset()
        original = limiter.limit
        limiter.limit = 3
        try:
            codes = [
                self.client.post(
                    "/api/v1/tracking/affiliate-click",
                    json={"offer_id": offer["id"], "cta_name": "x"},
                ).status_code
                for _ in range(5)
            ]
        finally:
            limiter.limit = original
            limiter.reset()
        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3], 429)

    def test_tracking_rejects_oversized_payload(self):
        offer = self._create_offer(name="長すぎ")
        r = self.client.post(
            "/api/v1/tracking/affiliate-click",
            json={"offer_id": offer["id"], "keyword": "あ" * 500},
        )
        self.assertEqual(r.status_code, 422)

    # ---------------- keywords ----------------

    def test_keyword_scoring(self):
        r = self.client.post(
            "/api/v1/keywords/score",
            json={
                "payout": 8500, "approval_rate": 1.0, "advertiser_cvr": 0.08,
                "target_roas": 1.5,
                "keywords": [
                    {"keyword": "ロレックス 買取 相場", "avg_monthly_searches": 2400,
                     "forecast_cpc": 180, "commercial_intent": 85,
                     "estimated_lp_ctr": 0.5, "ai_confidence": 0.8, "cluster": "ロレックス査定"},
                    {"keyword": "腕時計", "avg_monthly_searches": 90000,
                     "forecast_cpc": 500, "commercial_intent": 20,
                     "estimated_lp_ctr": 0.2, "cluster": "一般語"},
                ],
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["keywords"][0]["bucket"], "CORE")
        self.assertEqual(body["summary"]["bucket_counts"]["EXCLUDE"], 1)
        self.assertEqual(len(body["clusters"]), 2)

    def test_keyword_scoring_persists(self):
        offer = self._create_offer(name="KW保存")
        r = self.client.post(
            "/api/v1/keywords/score",
            json={
                "payout": 8500, "approval_rate": 1.0, "advertiser_cvr": 0.08,
                "target_roas": 1.5, "offer_id": offer["id"], "persist": True,
                "keywords": [{"keyword": "ロレックス 買取", "forecast_cpc": 180,
                              "commercial_intent": 85, "estimated_lp_ctr": 0.5,
                              "avg_monthly_searches": 1000}],
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        saved = self.client.get(f"/api/v1/offers/{offer['id']}/keywords").json()["keywords"]
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["keyword"], "ロレックス 買取")

    def test_classify_without_ai_key_returns_503(self):
        r = self.client.post(
            "/api/v1/keywords/classify",
            json={"offer_name": "A", "payout": 8500, "keywords": ["時計 買取"]},
        )
        # キー未設定の環境では503。設定済みなら200。どちらでも500にはならない。
        self.assertIn(r.status_code, (200, 503))

    # ---------------- imports ----------------

    KEYWORD_CSV = (
        "キーワード レポート (2026-08-01 - 2026-08-13)\n"
        "\n"
        "キーワード,キャンペーン,広告グループ,マッチタイプ,表示回数,クリック数,費用,コンバージョン,コンバージョンの価値\n"
        "ロレックス 買取,時計_完全一致,ロレックス,完全一致,\"1,200\",48,\"7,200\",1.00,\"8,500\"\n"
        "オメガ 買取,時計_完全一致,オメガ,完全一致,800,22,\"3,300\",0.00,--\n"
        "合計: アカウント,,,,\"2,000\",70,\"10,500\",1.00,\"8,500\"\n"
    )

    def test_import_keyword_report(self):
        offer = self._create_offer(name="CSV取込")
        r = self.client.post(
            "/api/v1/imports/google-ads/keywords",
            data={"offer_id": offer["id"], "report_date": "2026-08-13"},
            files={"file": ("keywords.csv", self.KEYWORD_CSV.encode("utf-8-sig"), "text/csv")},
        )
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["imported"], 2)  # 合計行は除外される
        self.assertEqual(body["errors"], [])

        totals = self.client.get(f"/api/v1/offers/{offer['id']}/funnel").json()["totals"]
        self.assertEqual(totals["clicks"], 70)
        self.assertEqual(totals["cost"], 10500)
        self.assertEqual(totals["conversion_value"], 8500)

    def test_import_rejects_unknown_offer(self):
        r = self.client.post(
            "/api/v1/imports/google-ads/keywords",
            data={"offer_id": "nope"},
            files={"file": ("k.csv", self.KEYWORD_CSV.encode(), "text/csv")},
        )
        self.assertEqual(r.status_code, 404)

    def test_import_approvals_switches_rate_source(self):
        offer = self._create_offer(name="承認取込")
        csv_text = (
            "発生日,発生件数,承認件数,否認件数,確定報酬\n"
            "2026-07-01,10,7,3,\"59,500\"\n"
        )
        r = self.client.post(
            "/api/v1/imports/approvals",
            data={"offer_id": offer["id"]},
            files={"file": ("a.csv", csv_text.encode("utf-8"), "text/csv")},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["imported"], 1)

        d = self.client.get(f"/api/v1/offers/{offer['id']}/diagnosis").json()
        self.assertEqual(d["approval_rate_source"], "actual")
        self.assertAlmostEqual(d["approval_rate_used"], 0.7, places=6)

    # ---------------- diagnosis / dashboard ----------------

    def test_diagnosis_end_to_end(self):
        """CSV取込 → 計測 → 診断 → 意思決定ログまで一気通貫で動くこと"""
        offer = self._create_offer(name="一気通貫", min_test_clicks=10)
        self.client.post(
            "/api/v1/imports/google-ads/keywords",
            data={"offer_id": offer["id"], "report_date": "2026-08-13"},
            files={"file": ("k.csv", self.KEYWORD_CSV.encode("utf-8-sig"), "text/csv")},
        )
        for i in range(25):
            self.client.post(
                "/api/v1/tracking/affiliate-click",
                json={"offer_id": offer["id"], "session_id": f"s{i}"},
            )

        r = self.client.get(f"/api/v1/offers/{offer['id']}/diagnosis")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["totals"]["clicks"], 70)
        self.assertEqual(body["totals"]["affiliate_clicks"], 25)
        self.assertEqual(body["approval_rate_source"], "expected")
        self.assertIn(body["runtime"]["decision"], ("SCALE", "KEEP", "IMPROVE", "TEST", "STOP"))
        self.assertIsNotNone(body["decision_id"])

        decisions = self.client.get(
            f"/api/v1/decisions?entity_id={offer['id']}"
        ).json()["decisions"]
        self.assertGreaterEqual(len(decisions), 1)

    def test_dashboard(self):
        self._create_offer(name="ダッシュボード確認")
        r = self.client.get("/api/v1/dashboard")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("cards", body)
        self.assertIn("board", body)
        self.assertEqual(
            set(body["board"].keys()), {"SCALE", "KEEP", "IMPROVE", "TEST", "STOP"}
        )

    # ---------------- google ----------------

    def test_google_sync_reports_not_configured(self):
        offer = self._create_offer(name="Google未設定")
        r = self.client.post(
            f"/api/v1/google/sync?offer_id={offer['id']}"
            "&date_from=2026-08-01&date_to=2026-08-13"
        )
        self.assertIn(r.status_code, (501, 502))


@unittest.skipUnless(HAS_FASTAPI, "fastapi/httpx が未インストール")
class AuthTests(unittest.TestCase):
    def test_admin_key_is_enforced_when_set(self):
        from app.api import deps
        from app.config import Settings
        from app.db.store import Store
        from app.main import app

        deps.reset_store_for_tests(Store(":memory:"))
        app.dependency_overrides[deps.get_settings] = lambda: Settings(admin_api_key="secret")
        try:
            client = TestClient(app)
            self.assertEqual(client.get("/api/v1/offers").status_code, 401)
            r = client.get("/api/v1/offers", headers={"X-API-Key": "secret"})
            self.assertEqual(r.status_code, 200)
            r = client.get("/api/v1/offers", headers={"X-API-Key": "wrong"})
            self.assertEqual(r.status_code, 401)
            # 公開の計測エンドポイントは認証なしで通る
            r = client.post(
                "/api/v1/tracking/affiliate-click",
                json={"offer_id": "x", "cta_name": "fv"},
            )
            self.assertEqual(r.status_code, 200)
        finally:
            app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
