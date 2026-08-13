"""SQLiteリポジトリ（標準ライブラリのみ）。

MVPはイベントをメモリに積むだけで、再起動すると消えていた。
ここではSQLiteを既定にして「Dockerを立てなくても永続化される」状態にする。
PostgreSQLへ移行する場合も列構成は docs/schema.postgres.sql と揃えてある。
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional

SCHEMA_PATH = Path(__file__).with_name("schema.sqlite.sql")

_LOCAL = threading.local()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex


class Store:
    """スレッドごとに接続を分けるシンプルなリポジトリ。"""

    def __init__(self, path: str):
        self.path = path
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._memory_conn: Optional[sqlite3.Connection] = None
        self._memory_lock = threading.Lock()
        self.init_schema()

    # ---------- 接続 ----------

    def _connect(self) -> sqlite3.Connection:
        # FastAPIは同期エンドポイントをスレッドプールで実行するため、
        # 接続をスレッドに固定しない（共有時は下のロックで直列化する）。
        conn = sqlite3.connect(self.path, timeout=10.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        if self.path == ":memory:":
            # インメモリDBは接続を共有しないと中身が消えるので、ロックで直列化する
            with self._memory_lock:
                if self._memory_conn is None:
                    self._memory_conn = self._connect()
                try:
                    yield self._memory_conn
                    self._memory_conn.commit()
                except Exception:
                    self._memory_conn.rollback()
                    raise
            return

        conn = getattr(_LOCAL, "conn", None)
        if conn is None:
            conn = self._connect()
            _LOCAL.conn = conn
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def init_schema(self) -> None:
        with self.connection() as conn:
            conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    # ---------- offers ----------

    OFFER_FIELDS = (
        "name", "asp_name", "payout", "approval_rate", "advertiser_cvr",
        "advertiser_cvr_confidence", "conversion_point", "target_roas",
        "max_test_budget", "min_test_clicks", "stop_after_zero_cv_clicks",
        "scale_roas_multiplier", "official_url", "asp_url", "status", "notes",
    )

    def create_offer(self, data: Dict[str, Any]) -> Dict[str, Any]:
        offer_id = data.get("id") or new_id()
        # 未指定の列は SQL 側の DEFAULT に任せる（None を明示挿入すると NOT NULL に当たる）
        present = [k for k in self.OFFER_FIELDS if data.get(k) is not None]
        columns = ", ".join(["id", *present, "created_at", "updated_at"])
        placeholders = ", ".join(["?"] * (len(present) + 3))
        ts = now_iso()
        with self.connection() as conn:
            conn.execute(
                f"INSERT INTO offers ({columns}) VALUES ({placeholders})",
                [offer_id, *[data[k] for k in present], ts, ts],
            )
            self._upsert_rules(conn, offer_id, data.get("rules") or {})
        return self.get_offer(offer_id)  # type: ignore[return-value]

    def update_offer(self, offer_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        fields = [k for k in self.OFFER_FIELDS if k in data]
        with self.connection() as conn:
            if fields:
                assignments = ", ".join(f"{k} = ?" for k in fields)
                cur = conn.execute(
                    f"UPDATE offers SET {assignments}, updated_at = ? WHERE id = ?",
                    [*[data[k] for k in fields], now_iso(), offer_id],
                )
                if cur.rowcount == 0:
                    return None
            if "rules" in data:
                self._upsert_rules(conn, offer_id, data["rules"] or {})
        return self.get_offer(offer_id)

    def _upsert_rules(self, conn: sqlite3.Connection, offer_id: str, rules: Dict[str, Any]) -> None:
        payload = {
            "trademark_allowed": int(bool(rules.get("trademark_allowed", False))),
            "competitor_allowed": int(bool(rules.get("competitor_allowed", False))),
            "listing_allowed": int(bool(rules.get("listing_allowed", True))),
            "geo_rules_json": json.dumps(rules.get("geo_rules", []), ensure_ascii=False),
            "age_rules_json": json.dumps(rules.get("age_rules", []), ensure_ascii=False),
            "device_rules_json": json.dumps(rules.get("device_rules", []), ensure_ascii=False),
            "negative_rules_json": json.dumps(rules.get("negative_rules", []), ensure_ascii=False),
            "notes": rules.get("notes"),
        }
        cols = ", ".join(payload)
        placeholders = ", ".join(["?"] * len(payload))
        updates = ", ".join(f"{k} = excluded.{k}" for k in payload)
        conn.execute(
            f"INSERT INTO offer_rules (offer_id, {cols}) VALUES (?, {placeholders}) "
            f"ON CONFLICT(offer_id) DO UPDATE SET {updates}",
            [offer_id, *payload.values()],
        )

    def get_offer(self, offer_id: str) -> Optional[Dict[str, Any]]:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM offers WHERE id = ?", (offer_id,)).fetchone()
            if row is None:
                return None
            offer = dict(row)
            rules = conn.execute(
                "SELECT * FROM offer_rules WHERE offer_id = ?", (offer_id,)
            ).fetchone()
        offer["rules"] = self._rules_to_dict(rules)
        return offer

    def list_offers(self) -> List[Dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM offers ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]

    def delete_offer(self, offer_id: str) -> bool:
        with self.connection() as conn:
            cur = conn.execute("DELETE FROM offers WHERE id = ?", (offer_id,))
        return cur.rowcount > 0

    @staticmethod
    def _rules_to_dict(row: Optional[sqlite3.Row]) -> Dict[str, Any]:
        if row is None:
            return {
                "trademark_allowed": False,
                "competitor_allowed": False,
                "listing_allowed": True,
                "geo_rules": [],
                "age_rules": [],
                "device_rules": [],
                "negative_rules": [],
                "notes": None,
            }
        return {
            "trademark_allowed": bool(row["trademark_allowed"]),
            "competitor_allowed": bool(row["competitor_allowed"]),
            "listing_allowed": bool(row["listing_allowed"]),
            "geo_rules": json.loads(row["geo_rules_json"]),
            "age_rules": json.loads(row["age_rules_json"]),
            "device_rules": json.loads(row["device_rules_json"]),
            "negative_rules": json.loads(row["negative_rules_json"]),
            "notes": row["notes"],
        }

    # ---------- LPクリック計測 ----------

    def record_lp_click(self, event: Dict[str, Any], client_ip_hash: Optional[str] = None) -> str:
        event_id = new_id()
        with self.connection() as conn:
            conn.execute(
                """INSERT INTO lp_click_events
                   (id, occurred_at, offer_id, session_id, gclid, wbraid, gbraid,
                    campaign_id, ad_group_id, keyword, match_type, device,
                    landing_page, cta_name, client_ip_hash)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    event_id,
                    event.get("occurred_at") or now_iso(),
                    event.get("offer_id"),
                    event.get("session_id"),
                    event.get("gclid"),
                    event.get("wbraid"),
                    event.get("gbraid"),
                    event.get("campaign_id"),
                    event.get("ad_group_id"),
                    event.get("keyword"),
                    event.get("match_type"),
                    event.get("device"),
                    event.get("landing_page"),
                    event.get("cta_name") or "primary",
                    client_ip_hash,
                ),
            )
        return event_id

    def count_lp_clicks(
        self, offer_id: Optional[str] = None, date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> int:
        clauses, params = [], []
        if offer_id:
            clauses.append("offer_id = ?")
            params.append(offer_id)
        if date_from:
            clauses.append("occurred_at >= ?")
            params.append(date_from)
        if date_to:
            clauses.append("occurred_at <= ?")
            params.append(date_to)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.connection() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS c FROM lp_click_events {where}", params
            ).fetchone()
        return int(row["c"])

    def lp_clicks_by_keyword(self, offer_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                """SELECT COALESCE(keyword, '(不明)') AS keyword,
                          COUNT(*) AS affiliate_clicks,
                          COUNT(DISTINCT session_id) AS sessions
                   FROM lp_click_events WHERE offer_id = ?
                   GROUP BY keyword ORDER BY affiliate_clicks DESC LIMIT ?""",
                (offer_id, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    # ---------- Google Ads 実績 ----------

    def upsert_ad_stats(self, rows: Iterable[Dict[str, Any]]) -> int:
        count = 0
        with self.connection() as conn:
            for r in rows:
                conn.execute(
                    """INSERT INTO ad_stats_daily
                       (date, offer_id, campaign_id, ad_group_id, criterion_id,
                        keyword_text, match_type, impressions, clicks, cost,
                        conversions, conversion_value)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(date, offer_id, campaign_id, ad_group_id, criterion_id)
                       DO UPDATE SET keyword_text=excluded.keyword_text,
                                     match_type=excluded.match_type,
                                     impressions=excluded.impressions,
                                     clicks=excluded.clicks,
                                     cost=excluded.cost,
                                     conversions=excluded.conversions,
                                     conversion_value=excluded.conversion_value""",
                    (
                        r.get("date"), r.get("offer_id"), r.get("campaign_id") or "",
                        r.get("ad_group_id") or "", r.get("criterion_id") or r.get("keyword_text") or "",
                        r.get("keyword_text"), r.get("match_type"),
                        int(r.get("impressions") or 0), int(r.get("clicks") or 0),
                        float(r.get("cost") or 0), float(r.get("conversions") or 0),
                        float(r.get("conversion_value") or 0),
                    ),
                )
                count += 1
        return count

    def upsert_search_terms(self, rows: Iterable[Dict[str, Any]]) -> int:
        count = 0
        with self.connection() as conn:
            for r in rows:
                conn.execute(
                    """INSERT INTO search_terms_daily
                       (date, offer_id, campaign_id, ad_group_id, search_term,
                        impressions, clicks, cost, conversions, conversion_value)
                       VALUES (?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(date, offer_id, campaign_id, ad_group_id, search_term)
                       DO UPDATE SET impressions=excluded.impressions,
                                     clicks=excluded.clicks,
                                     cost=excluded.cost,
                                     conversions=excluded.conversions,
                                     conversion_value=excluded.conversion_value""",
                    (
                        r.get("date"), r.get("offer_id"), r.get("campaign_id") or "",
                        r.get("ad_group_id") or "", r.get("search_term"),
                        int(r.get("impressions") or 0), int(r.get("clicks") or 0),
                        float(r.get("cost") or 0), float(r.get("conversions") or 0),
                        float(r.get("conversion_value") or 0),
                    ),
                )
                count += 1
        return count

    def offer_totals(
        self, offer_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None
    ) -> Dict[str, float]:
        """案件のファネル実績を集計する。アフィクリックは自前計測から取る。"""
        clauses, params = ["offer_id = ?"], [offer_id]
        if date_from:
            clauses.append("date >= ?")
            params.append(date_from)
        if date_to:
            clauses.append("date <= ?")
            params.append(date_to)
        where = " AND ".join(clauses)
        with self.connection() as conn:
            row = conn.execute(
                f"""SELECT COALESCE(SUM(impressions),0) AS impressions,
                           COALESCE(SUM(clicks),0) AS clicks,
                           COALESCE(SUM(cost),0) AS cost,
                           COALESCE(SUM(conversions),0) AS conversions,
                           COALESCE(SUM(conversion_value),0) AS conversion_value
                    FROM ad_stats_daily WHERE {where}""",
                params,
            ).fetchone()
        totals = {k: row[k] for k in row.keys()}
        totals["affiliate_clicks"] = self.count_lp_clicks(offer_id, date_from, date_to)
        return totals

    # ---------- 承認実績 ----------

    def record_approval(self, row: Dict[str, Any]) -> str:
        approval_id = new_id()
        with self.connection() as conn:
            conn.execute(
                """INSERT INTO approvals
                   (id, offer_id, conversion_date, count, approved_count,
                    rejected_count, approved_revenue, source)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    approval_id, row.get("offer_id"), row.get("conversion_date"),
                    float(row.get("count") or 0), float(row.get("approved_count") or 0),
                    float(row.get("rejected_count") or 0),
                    float(row.get("approved_revenue") or 0), row.get("source") or "csv",
                ),
            )
        return approval_id

    def actual_approval_rate(self, offer_id: str) -> Optional[float]:
        """承認実績があれば実績値を返す。なければ None（案件マスターの期待値を使う）。"""
        with self.connection() as conn:
            row = conn.execute(
                """SELECT COALESCE(SUM(count),0) AS total,
                          COALESCE(SUM(approved_count),0) AS approved
                   FROM approvals WHERE offer_id = ?""",
                (offer_id,),
            ).fetchone()
        if not row or row["total"] <= 0:
            return None
        return row["approved"] / row["total"]

    # ---------- 意思決定ログ ----------

    def record_decision(
        self, entity_type: str, entity_id: str, decision: str,
        reason_codes: List[str], metrics: Dict[str, Any], recommendation: Dict[str, Any],
    ) -> str:
        decision_id = new_id()
        with self.connection() as conn:
            conn.execute(
                """INSERT INTO decisions
                   (id, entity_type, entity_id, decision, reason_codes_json,
                    metrics_snapshot_json, recommendation_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    decision_id, entity_type, entity_id, decision,
                    json.dumps(reason_codes, ensure_ascii=False),
                    json.dumps(metrics, ensure_ascii=False, default=str),
                    json.dumps(recommendation, ensure_ascii=False, default=str),
                    now_iso(),
                ),
            )
        return decision_id

    def list_decisions(self, entity_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        with self.connection() as conn:
            if entity_id:
                rows = conn.execute(
                    "SELECT * FROM decisions WHERE entity_id = ? ORDER BY created_at DESC LIMIT ?",
                    (entity_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?", (limit,)
                ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["reason_codes"] = json.loads(d.pop("reason_codes_json"))
            d["metrics_snapshot"] = json.loads(d.pop("metrics_snapshot_json"))
            d["recommendation"] = json.loads(d.pop("recommendation_json"))
            out.append(d)
        return out

    # ---------- KW候補 ----------

    def save_keyword_scores(self, offer_id: str, scores: Iterable[Dict[str, Any]]) -> int:
        count = 0
        with self.connection() as conn:
            for s in scores:
                conn.execute(
                    """INSERT INTO keyword_candidates
                       (id, offer_id, keyword, normalized_keyword, intent, cluster,
                        bucket, commercial_intent, conversion_distance, noise_risk,
                        ai_estimated_lp_ctr, ai_confidence, priority_score,
                        required_lp_ctr, cpc_headroom)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(offer_id, normalized_keyword) DO UPDATE SET
                         intent=excluded.intent, cluster=excluded.cluster,
                         bucket=excluded.bucket, commercial_intent=excluded.commercial_intent,
                         conversion_distance=excluded.conversion_distance,
                         noise_risk=excluded.noise_risk,
                         ai_estimated_lp_ctr=excluded.ai_estimated_lp_ctr,
                         ai_confidence=excluded.ai_confidence,
                         priority_score=excluded.priority_score,
                         required_lp_ctr=excluded.required_lp_ctr,
                         cpc_headroom=excluded.cpc_headroom""",
                    (
                        new_id(), offer_id, s.get("keyword"), s.get("normalized_keyword"),
                        s.get("intent"), s.get("cluster"), s.get("bucket"),
                        s.get("commercial_intent"), s.get("conversion_distance"),
                        s.get("noise_risk"), s.get("estimated_lp_ctr"),
                        s.get("ai_confidence"), s.get("priority_score"),
                        s.get("required_lp_ctr"), s.get("cpc_headroom"),
                    ),
                )
                count += 1
        return count

    def list_keywords(self, offer_id: str, bucket: Optional[str] = None) -> List[Dict[str, Any]]:
        with self.connection() as conn:
            if bucket:
                rows = conn.execute(
                    "SELECT * FROM keyword_candidates WHERE offer_id = ? AND bucket = ? "
                    "ORDER BY priority_score DESC",
                    (offer_id, bucket),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM keyword_candidates WHERE offer_id = ? "
                    "ORDER BY priority_score DESC",
                    (offer_id,),
                ).fetchall()
        return [dict(r) for r in rows]
