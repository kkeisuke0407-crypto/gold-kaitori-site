from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status

from app.api import schemas as S
from app.api.deps import enforce_tracking_limit, get_store, hash_ip, client_ip, require_admin
from app.config import Settings, get_settings
from app.db.store import Store
from app.domain.decision_engine import (
    PreflightInput,
    RuntimeInput,
    calculate_preflight,
    evaluate_runtime,
)
from app.domain.keyword_scoring import (
    KeywordInput,
    OfferEconomics,
    aggregate_clusters,
    score_keywords,
)
from app.integrations.ai_provider import AIProviderError
from app.integrations.csv_import import (
    import_approval_csv,
    import_keyword_report,
    import_search_term_report,
)
from app.integrations.google_ads import GoogleAdsNotConfigured, GoogleAdsReadAdapter
from app.integrations.openai_provider import get_provider
from app.integrations.slvrbullet import lp_setup_checklist

router = APIRouter(prefix="/api/v1")

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB


# =================================================================== 意思決定


@router.post("/decision/preflight", response_model=S.PreflightResponse, tags=["decision"])
def preflight(payload: S.PreflightRequest):
    """出稿前の採算判定。AIキー不要で常に動く（SPEC 受入基準9）。"""
    try:
        result = calculate_preflight(PreflightInput(**payload.model_dump()))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return result.to_dict()


@router.post("/decision/runtime", response_model=S.RuntimeResponse, tags=["decision"])
def runtime(payload: S.RuntimeRequest):
    """運用中の診断とSCALE/KEEP/IMPROVE/TEST/STOP判定。"""
    try:
        result = evaluate_runtime(RuntimeInput(**payload.model_dump()))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return result.to_dict()


# =================================================================== 案件


@router.post(
    "/offers", status_code=status.HTTP_201_CREATED, tags=["offers"],
    dependencies=[Depends(require_admin)],
)
def create_offer(payload: S.OfferCreate, store: Store = Depends(get_store)):
    data = payload.model_dump()
    data["rules"] = payload.rules.model_dump()
    return store.create_offer(data)


@router.get("/offers", tags=["offers"], dependencies=[Depends(require_admin)])
def list_offers(store: Store = Depends(get_store)):
    return {"offers": store.list_offers()}


@router.get("/offers/{offer_id}", tags=["offers"], dependencies=[Depends(require_admin)])
def get_offer(offer_id: str, store: Store = Depends(get_store)):
    offer = store.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    return offer


@router.patch("/offers/{offer_id}", tags=["offers"], dependencies=[Depends(require_admin)])
def update_offer(offer_id: str, payload: S.OfferUpdate, store: Store = Depends(get_store)):
    data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "rules" in data and payload.rules is not None:
        data["rules"] = payload.rules.model_dump()
    updated = store.update_offer(offer_id, data)
    if updated is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    return updated


@router.delete("/offers/{offer_id}", tags=["offers"], dependencies=[Depends(require_admin)])
def delete_offer(offer_id: str, store: Store = Depends(get_store)):
    if not store.delete_offer(offer_id):
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    return {"deleted": True}


@router.get("/offers/{offer_id}/setup", tags=["offers"], dependencies=[Depends(require_admin)])
def offer_setup(offer_id: str, request: Request, store: Store = Depends(get_store)):
    """この案件のLPに入れるタグ一式を返す。"""
    if store.get_offer(offer_id) is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    endpoint = str(request.url_for("track_affiliate_click"))
    return {"checklist": lp_setup_checklist(endpoint, offer_id)}


# =================================================================== 診断


def _runtime_from_offer(
    offer: Dict[str, Any], totals: Dict[str, Any], approval_rate: float
) -> RuntimeInput:
    return RuntimeInput(
        impressions=int(totals.get("impressions") or 0),
        clicks=int(totals.get("clicks") or 0),
        cost=float(totals.get("cost") or 0),
        affiliate_clicks=int(totals.get("affiliate_clicks") or 0),
        conversions=float(totals.get("conversions") or 0),
        conversion_value=float(totals.get("conversion_value") or 0),
        approval_rate=approval_rate,
        target_roas=float(offer["target_roas"]),
        max_test_budget=float(offer["max_test_budget"]),
        min_test_clicks=int(offer["min_test_clicks"]),
        stop_after_zero_cv_clicks=int(offer["stop_after_zero_cv_clicks"]),
        scale_roas_multiplier=float(offer["scale_roas_multiplier"]),
        payout=float(offer["payout"]),
        advertiser_cvr=float(offer["advertiser_cvr"]),
    )


@router.get(
    "/offers/{offer_id}/diagnosis", response_model=S.DiagnosisResponse,
    tags=["decision"], dependencies=[Depends(require_admin)],
)
def diagnose_offer(
    offer_id: str,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    persist: bool = Query(default=True, description="判定結果を decisions に記録する"),
    store: Store = Depends(get_store),
):
    """保存済み実績から自動で判定する。承認実績があれば承認率を実績値で上書きする。"""
    offer = store.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")

    totals = store.offer_totals(offer_id, date_from, date_to)
    actual = store.actual_approval_rate(offer_id)
    approval_rate = actual if actual is not None else float(offer["approval_rate"])
    source = "actual" if actual is not None else "expected"

    result = evaluate_runtime(_runtime_from_offer(offer, totals, approval_rate))
    decision_id = None
    if persist:
        decision_id = store.record_decision(
            "offer", offer_id, result.decision.value, result.reason_codes,
            {**totals, "approval_rate": approval_rate, "approval_rate_source": source},
            {
                "recommendations": result.recommendations,
                "improvement": result.improvement,
                "budget_suggestion": result.budget_suggestion,
            },
        )

    return {
        "offer": offer,
        "totals": totals,
        "approval_rate_used": approval_rate,
        "approval_rate_source": source,
        "runtime": result.to_dict(),
        "decision_id": decision_id,
    }


@router.get("/dashboard", tags=["decision"], dependencies=[Depends(require_admin)])
def dashboard(store: Store = Depends(get_store)):
    """全案件のサマリとStop/Scaleボード（SPEC 16.1 / 16.5）。"""
    cards = {
        "cost": 0.0, "revenue": 0.0, "expected_approved_revenue": 0.0,
        "profit": 0.0, "conversions": 0.0, "affiliate_clicks": 0,
    }
    board: Dict[str, List[Dict[str, Any]]] = {
        k: [] for k in ("SCALE", "KEEP", "IMPROVE", "TEST", "STOP")
    }
    rows: List[Dict[str, Any]] = []

    for offer in store.list_offers():
        totals = store.offer_totals(offer["id"])
        actual = store.actual_approval_rate(offer["id"])
        approval_rate = actual if actual is not None else float(offer["approval_rate"])
        result = evaluate_runtime(_runtime_from_offer(offer, totals, approval_rate))

        cards["cost"] += totals["cost"]
        cards["revenue"] += totals["conversion_value"]
        cards["expected_approved_revenue"] += result.expected_approved_revenue
        cards["profit"] += result.profit
        cards["conversions"] += totals["conversions"]
        cards["affiliate_clicks"] += totals["affiliate_clicks"]

        row = {
            "offer_id": offer["id"],
            "name": offer["name"],
            "decision": result.decision.value,
            "cost": totals["cost"],
            "revenue": totals["conversion_value"],
            "expected_approved_roas": result.expected_approved_roas,
            "profit": result.profit,
            "max_bottleneck": result.bottlenecks[0]["label"] if result.bottlenecks else "-",
            "next_action": result.recommendations[0] if result.recommendations else "-",
            "feasibility_score": result.improvement.get("feasibility_score", 0),
        }
        rows.append(row)
        board[result.decision.value].append(row)

    cards["roas"] = (cards["revenue"] / cards["cost"]) if cards["cost"] else 0.0
    cards["expected_approved_roas"] = (
        cards["expected_approved_revenue"] / cards["cost"] if cards["cost"] else 0.0
    )
    cards["scale_count"] = len(board["SCALE"])
    cards["stop_count"] = len(board["STOP"])
    return {"cards": cards, "offers": rows, "board": board}


@router.get("/decisions", tags=["decision"], dependencies=[Depends(require_admin)])
def list_decisions(
    entity_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    store: Store = Depends(get_store),
):
    return {"decisions": store.list_decisions(entity_id, limit)}


# =================================================================== KW


@router.post(
    "/keywords/score", response_model=S.KeywordScoreResponse,
    tags=["keywords"], dependencies=[Depends(require_admin)],
)
def score_keyword_list(payload: S.KeywordScoreRequest, store: Store = Depends(get_store)):
    """KWの採算判定とバケット分類。数式のみで動きAIに依存しない（SPEC 22.2）。"""
    offer = OfferEconomics(
        payout=payload.payout,
        approval_rate=payload.approval_rate,
        advertiser_cvr=payload.advertiser_cvr,
        target_roas=payload.target_roas,
    )
    scores = score_keywords(
        [KeywordInput(**row.model_dump()) for row in payload.keywords], offer
    )
    dicts = [s.to_dict() for s in scores]

    if payload.persist and payload.offer_id:
        if store.get_offer(payload.offer_id) is None:
            raise HTTPException(status_code=404, detail="案件が見つかりません")
        merged = [
            {**d, **row.model_dump()}
            for d, row in zip(dicts, payload.keywords)
        ]
        store.save_keyword_scores(payload.offer_id, merged)

    counts: Dict[str, int] = {}
    for d in dicts:
        counts[d["bucket"]] = counts.get(d["bucket"], 0) + 1
    return {
        "keywords": dicts,
        "clusters": aggregate_clusters(scores),
        "summary": {
            "total": len(dicts),
            "bucket_counts": counts,
            "total_expected_monthly_profit": round(
                sum(d["expected_monthly_profit"] for d in dicts), 0
            ),
            "affiliate_click_epc": round(offer.affiliate_click_epc, 2),
        },
    }


@router.get("/offers/{offer_id}/keywords", tags=["keywords"], dependencies=[Depends(require_admin)])
def list_offer_keywords(
    offer_id: str,
    bucket: Optional[str] = Query(default=None),
    store: Store = Depends(get_store),
):
    return {"keywords": store.list_keywords(offer_id, bucket)}


@router.post(
    "/keywords/classify", response_model=S.KeywordClassifyResponse,
    tags=["keywords"], dependencies=[Depends(require_admin)],
)
def classify_keywords(payload: S.KeywordClassifyRequest, settings: Settings = Depends(get_settings)):
    """AIによる意図分類。バケット判定は含まない（/keywords/score が数式で決める）。"""
    try:
        provider = get_provider(settings)
        items = provider.classify_keywords(payload.model_dump())
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"items": items, "provider": provider.name, "model": provider.model}


@router.post(
    "/keywords/seeds", response_model=S.SeedResponse,
    tags=["keywords"], dependencies=[Depends(require_admin)],
)
def generate_seeds(payload: S.SeedRequest, settings: Settings = Depends(get_settings)):
    """Google Keyword Ideas に投入するシードKWをAIで生成する（SPEC 7章 Step1）。"""
    try:
        provider = get_provider(settings)
        seeds = provider.generate_seeds(payload.model_dump())
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"seeds": seeds, "provider": provider.name, "model": provider.model}


# =================================================================== 計測


@router.post("/tracking/affiliate-click", tags=["tracking"], name="track_affiliate_click")
def track_affiliate_click(
    payload: S.AffiliateClickEvent,
    request: Request,
    store: Store = Depends(get_store),
    _: None = Depends(enforce_tracking_limit),
):
    """LP→アフィリンクのクリック計測。公開エンドポイントなのでレート制限付き（SPEC 17章）。

    ペイロードは信用しない。長さはスキーマで縛り、IPは生値を保存せずハッシュのみ持つ。
    数値の裏取りはGoogle Ads実績との突合で行う。
    """
    event_id = store.record_lp_click(
        payload.model_dump(), client_ip_hash=hash_ip(client_ip(request))
    )
    return {"accepted": True, "event_id": event_id}


@router.get("/offers/{offer_id}/funnel", tags=["tracking"], dependencies=[Depends(require_admin)])
def offer_funnel(offer_id: str, store: Store = Depends(get_store)):
    totals = store.offer_totals(offer_id)
    return {
        "totals": totals,
        "by_keyword": store.lp_clicks_by_keyword(offer_id),
    }


# =================================================================== 取り込み


async def _read_upload(file: UploadFile) -> bytes:
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="ファイルが大きすぎます（上限20MB）")
    if not raw:
        raise HTTPException(status_code=422, detail="ファイルが空です")
    return raw


@router.post(
    "/imports/google-ads/keywords", response_model=S.ImportResponse,
    tags=["imports"], dependencies=[Depends(require_admin)],
)
async def import_keywords_csv(
    offer_id: str = Form(...),
    report_date: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    store: Store = Depends(get_store),
):
    """Google Ads「キーワード レポート」CSVを取り込む。

    Developer Token の審査を待たずに実績を入れられる一次経路。
    """
    if store.get_offer(offer_id) is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    raw = await _read_upload(file)
    result = import_keyword_report(
        raw, offer_id, report_date or date.today().isoformat()
    )
    if result.rows:
        store.upsert_ad_stats(result.rows)
    return result.as_response()


@router.post(
    "/imports/google-ads/search-terms", response_model=S.ImportResponse,
    tags=["imports"], dependencies=[Depends(require_admin)],
)
async def import_search_terms_csv(
    offer_id: str = Form(...),
    report_date: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    store: Store = Depends(get_store),
):
    if store.get_offer(offer_id) is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    raw = await _read_upload(file)
    result = import_search_term_report(
        raw, offer_id, report_date or date.today().isoformat()
    )
    if result.rows:
        store.upsert_search_terms(result.rows)
    return result.as_response()


@router.post(
    "/imports/approvals", response_model=S.ImportResponse,
    tags=["imports"], dependencies=[Depends(require_admin)],
)
async def import_approvals_csv(
    offer_id: str = Form(...),
    file: UploadFile = File(...),
    store: Store = Depends(get_store),
):
    """ASPの承認結果CSV。取り込むと診断の承認率が期待値から実績値に切り替わる。"""
    if store.get_offer(offer_id) is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    raw = await _read_upload(file)
    result = import_approval_csv(raw, offer_id)
    for row in result.rows:
        store.record_approval(row)
    return result.as_response()


# =================================================================== Google Ads


@router.post("/google/sync", tags=["google"], dependencies=[Depends(require_admin)])
def google_sync(
    offer_id: str = Query(...),
    date_from: str = Query(...),
    date_to: str = Query(...),
    store: Store = Depends(get_store),
):
    """Google Ads API から実績を同期する（設定済みの場合のみ）。"""
    if store.get_offer(offer_id) is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    try:
        adapter = GoogleAdsReadAdapter.from_env()
        keyword_rows = adapter.sync_keyword_stats(date_from, date_to, offer_id)
        term_rows = adapter.sync_search_terms(date_from, date_to, offer_id)
    except GoogleAdsNotConfigured as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:  # 認証切れ・クォータ等
        raise HTTPException(status_code=502, detail=f"Google Ads同期に失敗しました: {exc}") from exc

    return {
        "keyword_rows": store.upsert_ad_stats(keyword_rows),
        "search_term_rows": store.upsert_search_terms(term_rows),
        "synced_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
