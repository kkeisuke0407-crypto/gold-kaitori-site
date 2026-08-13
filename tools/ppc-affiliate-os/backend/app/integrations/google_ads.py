"""Google Ads 読み取り専用アダプタ（SPEC 5.1）。

v0.1と同じく**変更系APIは一切持たない**。入札・予算・KWの自動変更はしない（SPEC 3.2）。
成果のGoogleへのアップロードはSLVRbulletの責務（SPEC 22.1）。

`google-ads` パッケージが入っていて認証情報が揃っていれば実データを取得し、
揃っていなければ理由を添えて例外を投げる。CSV取り込み経路があるので、
ここが未設定でもツール全体は運用できる。
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

__all__ = ["GoogleAdsConfig", "GoogleAdsNotConfigured", "GoogleAdsReadAdapter"]


class GoogleAdsNotConfigured(RuntimeError):
    pass


@dataclass(frozen=True)
class GoogleAdsConfig:
    developer_token: str
    client_id: str
    client_secret: str
    refresh_token: str
    login_customer_id: str
    customer_id: str

    @classmethod
    def from_env(cls) -> "GoogleAdsConfig":
        names = [
            "GOOGLE_ADS_DEVELOPER_TOKEN",
            "GOOGLE_ADS_CLIENT_ID",
            "GOOGLE_ADS_CLIENT_SECRET",
            "GOOGLE_ADS_REFRESH_TOKEN",
            "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
            "GOOGLE_ADS_CUSTOMER_ID",
        ]
        values = {name: os.getenv(name, "").strip() for name in names}
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise GoogleAdsNotConfigured(
                "Google Ads の設定が不足しています: " + ", ".join(missing)
                + "。設定が済むまでは管理画面のCSVエクスポートを /api/v1/imports から取り込んでください。"
            )
        return cls(*(values[name] for name in names))


class GoogleAdsReadAdapter:
    """読み取り専用。GAQLはSPEC 5.1「用途D」に対応。"""

    KEYWORD_DAILY_QUERY = """
        SELECT
          segments.date,
          campaign.id,
          campaign.name,
          ad_group.id,
          ad_group_criterion.criterion_id,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.average_cpc,
          metrics.conversions,
          metrics.conversions_value,
          metrics.all_conversions,
          metrics.all_conversions_value
        FROM keyword_view
        WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
    """

    SEARCH_TERM_DAILY_QUERY = """
        SELECT
          segments.date,
          campaign.id,
          ad_group.id,
          search_term_view.search_term,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value
        FROM search_term_view
        WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
    """

    # SLVRbullet が作ったコンバージョンアクションだけを分離集計する（SPEC 受入基準5）
    CONVERSION_ACTION_QUERY = """
        SELECT
          segments.date,
          segments.conversion_action,
          segments.conversion_action_name,
          campaign.id,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
          AND segments.conversion_action = '{conversion_action}'
    """

    def __init__(self, config: GoogleAdsConfig):
        self.config = config
        self._client = None

    @classmethod
    def from_env(cls) -> "GoogleAdsReadAdapter":
        return cls(GoogleAdsConfig.from_env())

    def _get_client(self):
        if self._client is None:
            try:
                from google.ads.googleads.client import GoogleAdsClient
            except ImportError as exc:  # pragma: no cover - 環境依存
                raise GoogleAdsNotConfigured(
                    "google-ads パッケージが未インストールです（pip install google-ads）"
                ) from exc
            self._client = GoogleAdsClient.load_from_dict(
                {
                    "developer_token": self.config.developer_token,
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                    "refresh_token": self.config.refresh_token,
                    "login_customer_id": self.config.login_customer_id,
                    "use_proto_plus": True,
                }
            )
        return self._client

    def _search(self, query: str) -> Iterable[Any]:
        client = self._get_client()
        service = client.get_service("GoogleAdsService")
        return service.search_stream(customer_id=self.config.customer_id, query=query)

    @staticmethod
    def _micros(value: Optional[int]) -> float:
        return (value or 0) / 1_000_000.0

    def sync_keyword_stats(self, date_from: str, date_to: str, offer_id: str) -> List[Dict[str, Any]]:
        query = self.KEYWORD_DAILY_QUERY.format(date_from=date_from, date_to=date_to)
        rows: List[Dict[str, Any]] = []
        for batch in self._search(query):
            for r in batch.results:
                rows.append(
                    {
                        "date": r.segments.date,
                        "offer_id": offer_id,
                        "campaign_id": str(r.campaign.id),
                        "ad_group_id": str(r.ad_group.id),
                        "criterion_id": str(r.ad_group_criterion.criterion_id),
                        "keyword_text": r.ad_group_criterion.keyword.text,
                        "match_type": r.ad_group_criterion.keyword.match_type.name,
                        "impressions": r.metrics.impressions,
                        "clicks": r.metrics.clicks,
                        "cost": self._micros(r.metrics.cost_micros),
                        "conversions": r.metrics.conversions,
                        "conversion_value": r.metrics.conversions_value,
                    }
                )
        return rows

    def sync_search_terms(self, date_from: str, date_to: str, offer_id: str) -> List[Dict[str, Any]]:
        query = self.SEARCH_TERM_DAILY_QUERY.format(date_from=date_from, date_to=date_to)
        rows: List[Dict[str, Any]] = []
        for batch in self._search(query):
            for r in batch.results:
                rows.append(
                    {
                        "date": r.segments.date,
                        "offer_id": offer_id,
                        "campaign_id": str(r.campaign.id),
                        "ad_group_id": str(r.ad_group.id),
                        "search_term": r.search_term_view.search_term,
                        "impressions": r.metrics.impressions,
                        "clicks": r.metrics.clicks,
                        "cost": self._micros(r.metrics.cost_micros),
                        "conversions": r.metrics.conversions,
                        "conversion_value": r.metrics.conversions_value,
                    }
                )
        return rows

    # --- Keyword Planning（レート制限が厳しいのでキャッシュ前提。SPEC 5.1 実装上の注意）---

    def generate_keyword_ideas(
        self, seeds: Iterable[str], page_url: Optional[str] = None,
        language_id: str = "1005", geo_target_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        client = self._get_client()
        service = client.get_service("KeywordPlanIdeaService")
        request = client.get_type("GenerateKeywordIdeasRequest")
        request.customer_id = self.config.customer_id
        request.language = f"languageConstants/{language_id}"
        for geo in geo_target_ids or ["2392"]:  # 2392 = 日本
            request.geo_target_constants.append(f"geoTargetConstants/{geo}")

        seed_list = [s for s in seeds if s]
        if seed_list and page_url:
            request.keyword_and_url_seed.url = page_url
            request.keyword_and_url_seed.keywords.extend(seed_list)
        elif seed_list:
            request.keyword_seed.keywords.extend(seed_list)
        elif page_url:
            request.url_seed.url = page_url
        else:
            raise ValueError("シードキーワードかURLのどちらかが必要です")

        out: List[Dict[str, Any]] = []
        for idea in service.generate_keyword_ideas(request=request):
            m = idea.keyword_idea_metrics
            out.append(
                {
                    "keyword": idea.text,
                    "avg_monthly_searches": m.avg_monthly_searches,
                    "competition": m.competition.name if m.competition else None,
                    "competition_index": m.competition_index,
                    "low_bid": self._micros(m.low_top_of_page_bid_micros),
                    "high_bid": self._micros(m.high_top_of_page_bid_micros),
                }
            )
        return out
