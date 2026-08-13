"""環境変数の集約。pydantic-settings を足さず標準ライブラリだけで済ませる。"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import List, Optional


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_list(name: str, default: str = "") -> List[str]:
    raw = _env(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name) or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_env: str = field(default_factory=lambda: _env("APP_ENV", "development"))
    database_path: str = field(default_factory=lambda: _env("DATABASE_PATH", "./data/ppc.db"))

    # 管理APIのキー。未設定なら開発モードとして素通しするが、起動時に警告を出す。
    admin_api_key: str = field(default_factory=lambda: _env("ADMIN_API_KEY"))
    cors_allow_origins: List[str] = field(
        default_factory=lambda: _env_list("CORS_ALLOW_ORIGINS")
    )

    # 公開エンドポイント（LPトラッカー）のレート制限
    tracking_rate_limit_per_minute: int = field(
        default_factory=lambda: _env_int("TRACKING_RATE_LIMIT_PER_MINUTE", 120)
    )
    tracking_allowed_origins: List[str] = field(
        default_factory=lambda: _env_list("TRACKING_ALLOWED_ORIGINS")
    )

    # AI プロバイダ
    ai_provider: str = field(default_factory=lambda: _env("AI_PROVIDER", "anthropic"))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    anthropic_model: str = field(
        default_factory=lambda: _env("ANTHROPIC_MODEL", "claude-opus-5")
    )
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))
    openai_model: str = field(default_factory=lambda: _env("OPENAI_MODEL", "gpt-4.1"))

    # Google Ads
    google_ads_developer_token: str = field(
        default_factory=lambda: _env("GOOGLE_ADS_DEVELOPER_TOKEN")
    )
    slvrbullet_conversion_action: str = field(
        default_factory=lambda: _env("SLVRBULLET_CONVERSION_ACTION_RESOURCE")
    )

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def effective_cors_origins(self) -> List[str]:
        if self.cors_allow_origins:
            return self.cors_allow_origins
        if self.is_production:
            # 本番でオリジン未設定なら閉じる。設定漏れで全開放にしない。
            return []
        return ["*"]

    def startup_warnings(self) -> List[str]:
        warnings: List[str] = []
        if not self.admin_api_key:
            warnings.append(
                "ADMIN_API_KEY が未設定です。管理APIが認証なしで公開されます。"
                "本番では必ず設定してください。"
            )
        if self.is_production and not self.cors_allow_origins:
            warnings.append(
                "本番で CORS_ALLOW_ORIGINS が未設定のため、ブラウザからのAPI利用を全て拒否します。"
            )
        if not self.anthropic_api_key and not self.openai_api_key:
            warnings.append("AIキーが未設定です。数式・判定は動作しますがKW分類は使えません。")
        return warnings


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
