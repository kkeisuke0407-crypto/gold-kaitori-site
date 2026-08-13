from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import get_settings

logger = logging.getLogger("ppc_affiliate_os")

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    for warning in settings.startup_warnings():
        logger.warning("[起動時チェック] %s", warning)
    yield


app = FastAPI(
    title="PPC Affiliate OS",
    version="0.2.0",
    lifespan=lifespan,
    description=(
        "PPCアフィリエイトの案件判定 / KW選定 / 運用診断 / 撤退判断を一つにする意思決定エンジン。\n\n"
        "数式・統計・撤退判定はコード側で完結しており、AIが停止しても動作する。"
    ),
)

# CORS: 本番でオリジン未設定なら閉じる（設定漏れで全開放にしない）
origins = settings.effective_cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)

app.include_router(router)

# 管理画面（public/tools/ppc/ と同じ実体）を配信する。
# リポジトリ構成: tools/ppc-affiliate-os/backend/app/main.py から見て 4つ上が repo root
_UI_DIR = Path(__file__).resolve().parents[4] / "public" / "tools" / "ppc"
if _UI_DIR.is_dir():
    app.mount("/ui", StaticFiles(directory=str(_UI_DIR), html=True), name="ui")


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "version": "0.2.0",
        "ai_provider": settings.ai_provider,
        "ai_configured": bool(settings.anthropic_api_key or settings.openai_api_key),
        "admin_auth_enabled": bool(settings.admin_api_key),
        "ui_mounted": _UI_DIR.is_dir(),
    }


@app.get("/", include_in_schema=False)
def index():
    return RedirectResponse(url="/ui/" if _UI_DIR.is_dir() else "/docs")
