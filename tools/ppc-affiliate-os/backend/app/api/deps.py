"""認証・レート制限・DIの共通部品（SPEC 17章）。"""
from __future__ import annotations

import hashlib
import hmac
import threading
import time
from collections import deque
from typing import Deque, Dict, Optional

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import Settings, get_settings
from app.db.store import Store

_store_lock = threading.Lock()
_store: Optional[Store] = None


def get_store() -> Store:
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                _store = Store(get_settings().database_path)
    return _store


def reset_store_for_tests(store: Optional[Store]) -> None:
    """テストからインメモリStoreに差し替えるためのフック。"""
    global _store
    _store = store


def require_admin(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    """管理APIの認証。キー未設定の開発環境では素通しする。"""
    if not settings.admin_api_key:
        return
    if not x_api_key or not hmac.compare_digest(x_api_key, settings.admin_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key ヘッダが不正です",
        )


class RateLimiter:
    """プロセス内スライディングウィンドウ。

    公開エンドポイントの最低限の保護。複数プロセスで動かすなら
    リバースプロキシ側の制限と併用する前提。
    """

    def __init__(self, limit_per_minute: int):
        self.limit = max(1, limit_per_minute)
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, now: Optional[float] = None) -> bool:
        current = now if now is not None else time.monotonic()
        window_start = current - 60.0
        with self._lock:
            bucket = self._hits.setdefault(key, deque())
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False
            bucket.append(current)
            # 使われなくなったキーが溜まり続けないよう、たまに掃除する
            if len(self._hits) > 10_000:
                for k in [k for k, v in self._hits.items() if not v]:
                    self._hits.pop(k, None)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


_tracking_limiter: Optional[RateLimiter] = None


def get_tracking_limiter() -> RateLimiter:
    global _tracking_limiter
    if _tracking_limiter is None:
        _tracking_limiter = RateLimiter(get_settings().tracking_rate_limit_per_minute)
    return _tracking_limiter


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hash_ip(ip: str) -> str:
    """生IPは保存しない。レート制限の突合と重複検知に使うハッシュだけを持つ。"""
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:32]


def enforce_tracking_limit(request: Request) -> None:
    limiter = get_tracking_limiter()
    if not limiter.allow(client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="レート制限に達しました",
        )
