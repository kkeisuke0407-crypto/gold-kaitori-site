from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------- Preflight


class PreflightRequest(BaseModel):
    payout: float = Field(ge=0, description="成果単価（円）")
    approval_rate: float = Field(ge=0, le=1, description="承認率 0〜1")
    advertiser_cvr: float = Field(ge=0, le=1, description="広告主CVR 0〜1")
    target_roas: float = Field(gt=0, description="1.5 = 150%")
    market_cpc: float = Field(ge=0, description="想定クリック単価（円）")
    estimated_lp_ctr: float = Field(ge=0, le=1, description="想定LP→アフィCTR")
    advertiser_cvr_confidence: float = Field(
        default=1.0, ge=0, le=1, description="広告主CVRの確信度。1.0=実績値"
    )
    expected_monthly_clicks: float = Field(default=0.0, ge=0)


class PreflightResponse(BaseModel):
    affiliate_click_epc: float
    ad_click_epc: float
    break_even_cpc: float
    target_cpc: float
    required_lp_ctr: float
    cpc_headroom: float
    monthly_profit_potential: float
    decision: str
    reason_codes: List[str]
    base: Dict[str, Any]
    downside: Dict[str, Any]
    upside: Dict[str, Any]
    notes: List[str]


# ---------------------------------------------------------------- Runtime


class RuntimeRequest(BaseModel):
    impressions: int = Field(ge=0)
    clicks: int = Field(ge=0)
    cost: float = Field(ge=0)
    affiliate_clicks: int = Field(ge=0)
    conversions: float = Field(ge=0)
    conversion_value: float = Field(ge=0)
    approval_rate: float = Field(ge=0, le=1)
    target_roas: float = Field(gt=0)
    max_test_budget: float = Field(ge=0)
    min_test_clicks: int = Field(ge=0)
    stop_after_zero_cv_clicks: int = Field(ge=0)
    scale_roas_multiplier: float = Field(default=1.2, gt=0)
    minimum_scale_conversions: float = Field(default=3.0, ge=0)
    payout: Optional[float] = Field(default=None, ge=0, description="渡すと統計的なCV0撤退判定が有効になる")
    advertiser_cvr: Optional[float] = Field(default=None, ge=0, le=1)
    credible_level: float = Field(default=0.80, gt=0, lt=1)
    zero_cv_alpha: float = Field(default=0.05, gt=0, lt=1)
    market_cpc_floor: Optional[float] = Field(default=None, ge=0)


class RuntimeResponse(BaseModel):
    ad_ctr: float
    actual_cpc: float
    lp_to_affiliate_ctr: float
    affiliate_cvr: float
    ad_to_final_cvr: float
    actual_roas: float
    expected_approved_revenue: float
    expected_approved_roas: float
    profit: float
    value_per_conversion: float
    roas_credible_low: float
    roas_credible_high: float
    bottleneck: str
    bottlenecks: List[Dict[str, Any]]
    improvement: Dict[str, Any]
    evidence: Dict[str, Any]
    budget_suggestion: Optional[Dict[str, Any]] = None
    decision: str
    reason_codes: List[str]
    recommendations: List[str]


# ---------------------------------------------------------------- Offers


class OfferRules(BaseModel):
    trademark_allowed: bool = False
    competitor_allowed: bool = False
    listing_allowed: bool = True
    geo_rules: List[str] = []
    age_rules: List[str] = []
    device_rules: List[str] = []
    negative_rules: List[str] = []
    notes: Optional[str] = None


class OfferCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    asp_name: Optional[str] = None
    payout: float = Field(ge=0)
    approval_rate: float = Field(default=1.0, ge=0, le=1)
    advertiser_cvr: float = Field(ge=0, le=1)
    advertiser_cvr_confidence: float = Field(default=1.0, ge=0, le=1)
    conversion_point: Optional[str] = None
    target_roas: float = Field(default=1.5, gt=0)
    max_test_budget: float = Field(default=0, ge=0)
    min_test_clicks: int = Field(default=100, ge=0)
    stop_after_zero_cv_clicks: int = Field(default=200, ge=0)
    scale_roas_multiplier: float = Field(default=1.2, gt=0)
    official_url: Optional[str] = None
    asp_url: Optional[str] = None
    status: str = "TEST"
    notes: Optional[str] = None
    rules: OfferRules = Field(default_factory=OfferRules)


class OfferUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    asp_name: Optional[str] = None
    payout: Optional[float] = Field(default=None, ge=0)
    approval_rate: Optional[float] = Field(default=None, ge=0, le=1)
    advertiser_cvr: Optional[float] = Field(default=None, ge=0, le=1)
    advertiser_cvr_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    conversion_point: Optional[str] = None
    target_roas: Optional[float] = Field(default=None, gt=0)
    max_test_budget: Optional[float] = Field(default=None, ge=0)
    min_test_clicks: Optional[int] = Field(default=None, ge=0)
    stop_after_zero_cv_clicks: Optional[int] = Field(default=None, ge=0)
    scale_roas_multiplier: Optional[float] = Field(default=None, gt=0)
    official_url: Optional[str] = None
    asp_url: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    rules: Optional[OfferRules] = None


# ---------------------------------------------------------------- Tracking


class AffiliateClickEvent(BaseModel):
    offer_id: str = Field(max_length=64)
    session_id: Optional[str] = Field(default=None, max_length=64)
    gclid: Optional[str] = Field(default=None, max_length=256)
    wbraid: Optional[str] = Field(default=None, max_length=256)
    gbraid: Optional[str] = Field(default=None, max_length=256)
    campaign_id: Optional[str] = Field(default=None, max_length=64)
    ad_group_id: Optional[str] = Field(default=None, max_length=64)
    keyword: Optional[str] = Field(default=None, max_length=256)
    match_type: Optional[str] = Field(default=None, max_length=16)
    device: Optional[str] = Field(default=None, max_length=16)
    landing_page: Optional[str] = Field(default=None, max_length=1024)
    cta_name: str = Field(default="primary", max_length=64)


# ---------------------------------------------------------------- Keywords


class KeywordRow(BaseModel):
    keyword: str = Field(min_length=1, max_length=256)
    avg_monthly_searches: float = Field(default=0, ge=0)
    competition_index: Optional[float] = Field(default=None, ge=0, le=100)
    low_bid: Optional[float] = Field(default=None, ge=0)
    high_bid: Optional[float] = Field(default=None, ge=0)
    forecast_cpc: Optional[float] = Field(default=None, ge=0)
    forecast_clicks: Optional[float] = Field(default=None, ge=0)
    intent: str = ""
    cluster: str = ""
    commercial_intent: float = Field(default=50, ge=0, le=100)
    conversion_distance: float = Field(default=50, ge=0, le=100)
    noise_risk: float = Field(default=30, ge=0, le=100)
    estimated_lp_ctr: float = Field(default=0.30, ge=0, le=1)
    ai_confidence: float = Field(default=0.5, ge=0, le=1)
    blocked_by_rule: bool = False
    blocked_reason: str = ""


class KeywordScoreRequest(BaseModel):
    payout: float = Field(ge=0)
    approval_rate: float = Field(ge=0, le=1)
    advertiser_cvr: float = Field(ge=0, le=1)
    target_roas: float = Field(gt=0)
    keywords: List[KeywordRow] = Field(min_length=1, max_length=2000)
    offer_id: Optional[str] = None
    persist: bool = False


class KeywordScoreResponse(BaseModel):
    keywords: List[Dict[str, Any]]
    clusters: List[Dict[str, Any]]
    summary: Dict[str, Any]


class KeywordClassification(BaseModel):
    keyword: str
    intent: str
    conversion_distance: int = Field(ge=0, le=100)
    commercial_intent: int = Field(ge=0, le=100)
    noise_risk: int = Field(ge=0, le=100)
    cluster: str
    estimated_lp_click_rate: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    reason: str


class KeywordClassifyRequest(BaseModel):
    offer_name: str = Field(min_length=1, max_length=200)
    conversion_point: str = ""
    payout: float = Field(ge=0)
    rules: List[str] = []
    keywords: List[str] = Field(min_length=1, max_length=200)


class KeywordClassifyResponse(BaseModel):
    items: List[KeywordClassification]
    provider: str
    model: str


class SeedRequest(BaseModel):
    offer_name: str = Field(min_length=1, max_length=200)
    description: str = ""
    conversion_point: str = ""
    target_audience: str = ""
    rules: List[str] = []
    landing_page_url: Optional[str] = None
    max_seeds: int = Field(default=40, ge=1, le=200)


class SeedResponse(BaseModel):
    seeds: List[Dict[str, str]]
    provider: str
    model: str


# ---------------------------------------------------------------- Imports


class ImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: List[str]
    detected_format: Optional[str] = None


# ---------------------------------------------------------------- Diagnosis


class DiagnosisResponse(BaseModel):
    offer: Dict[str, Any]
    totals: Dict[str, Any]
    approval_rate_used: float
    approval_rate_source: Literal["actual", "expected"]
    runtime: RuntimeResponse
    decision_id: Optional[str] = None
