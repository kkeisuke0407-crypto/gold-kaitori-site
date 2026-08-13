-- PPC Affiliate OS v0.2 / SQLite スキーマ
-- 既定はSQLite（外部サービス不要で即動く）。PostgreSQLへ移す場合は
-- docs/schema.postgres.sql を使う。列構成は揃えてある。

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS offers (
  id                        TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  asp_name                  TEXT,
  payout                    REAL NOT NULL,
  approval_rate             REAL NOT NULL DEFAULT 1.0,
  advertiser_cvr            REAL NOT NULL,
  advertiser_cvr_confidence REAL NOT NULL DEFAULT 1.0,
  conversion_point          TEXT,
  target_roas               REAL NOT NULL DEFAULT 1.5,
  max_test_budget           REAL NOT NULL DEFAULT 0,
  min_test_clicks           INTEGER NOT NULL DEFAULT 100,
  stop_after_zero_cv_clicks INTEGER NOT NULL DEFAULT 200,
  scale_roas_multiplier     REAL NOT NULL DEFAULT 1.2,
  official_url              TEXT,
  asp_url                   TEXT,
  status                    TEXT NOT NULL DEFAULT 'TEST',
  notes                     TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offer_rules (
  offer_id            TEXT PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
  trademark_allowed   INTEGER NOT NULL DEFAULT 0,
  competitor_allowed  INTEGER NOT NULL DEFAULT 0,
  listing_allowed     INTEGER NOT NULL DEFAULT 1,
  geo_rules_json      TEXT NOT NULL DEFAULT '[]',
  age_rules_json      TEXT NOT NULL DEFAULT '[]',
  device_rules_json   TEXT NOT NULL DEFAULT '[]',
  negative_rules_json TEXT NOT NULL DEFAULT '[]',
  notes               TEXT
);

CREATE TABLE IF NOT EXISTS keyword_candidates (
  id                  TEXT PRIMARY KEY,
  offer_id            TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  keyword             TEXT NOT NULL,
  normalized_keyword  TEXT NOT NULL,
  match_type          TEXT,
  intent              TEXT,
  cluster             TEXT,
  bucket              TEXT,
  conversion_distance REAL,
  commercial_intent   REAL,
  noise_risk          REAL,
  ai_estimated_lp_ctr REAL,
  ai_confidence       REAL,
  priority_score      REAL,
  required_lp_ctr     REAL,
  cpc_headroom        REAL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (offer_id, normalized_keyword)
);

CREATE TABLE IF NOT EXISTS keyword_metrics (
  keyword_candidate_id TEXT PRIMARY KEY REFERENCES keyword_candidates(id) ON DELETE CASCADE,
  avg_monthly_searches INTEGER,
  competition          TEXT,
  competition_index    INTEGER,
  low_bid              REAL,
  high_bid             REAL,
  forecast_impressions REAL,
  forecast_clicks      REAL,
  forecast_cpc         REAL,
  forecast_cost        REAL,
  fetched_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                        TEXT PRIMARY KEY,
  offer_id                  TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  google_customer_id        TEXT,
  google_campaign_id        TEXT,
  name                      TEXT,
  conversion_action_resource TEXT
);

CREATE TABLE IF NOT EXISTS ad_stats_daily (
  date             TEXT NOT NULL,
  offer_id         TEXT REFERENCES offers(id) ON DELETE CASCADE,
  campaign_id      TEXT,
  ad_group_id      TEXT,
  criterion_id     TEXT,
  keyword_text     TEXT,
  match_type       TEXT,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, offer_id, campaign_id, ad_group_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS search_terms_daily (
  date             TEXT NOT NULL,
  offer_id         TEXT REFERENCES offers(id) ON DELETE CASCADE,
  campaign_id      TEXT,
  ad_group_id      TEXT,
  search_term      TEXT NOT NULL,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, offer_id, campaign_id, ad_group_id, search_term)
);

CREATE TABLE IF NOT EXISTS lp_click_events (
  id           TEXT PRIMARY KEY,
  occurred_at  TEXT NOT NULL,
  offer_id     TEXT,
  session_id   TEXT,
  gclid        TEXT,
  wbraid       TEXT,
  gbraid       TEXT,
  campaign_id  TEXT,
  ad_group_id  TEXT,
  keyword      TEXT,
  match_type   TEXT,
  device       TEXT,
  landing_page TEXT,
  cta_name     TEXT,
  client_ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_lp_click_offer_time ON lp_click_events(offer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lp_click_gclid ON lp_click_events(gclid);
CREATE INDEX IF NOT EXISTS idx_lp_click_session ON lp_click_events(session_id);

CREATE TABLE IF NOT EXISTS approvals (
  id               TEXT PRIMARY KEY,
  offer_id         TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  conversion_date  TEXT NOT NULL,
  count            REAL NOT NULL DEFAULT 0,
  approved_count   REAL NOT NULL DEFAULT 0,
  rejected_count   REAL NOT NULL DEFAULT 0,
  approved_revenue REAL NOT NULL DEFAULT 0,
  source           TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_offer_date ON approvals(offer_id, conversion_date);

CREATE TABLE IF NOT EXISTS decisions (
  id                    TEXT PRIMARY KEY,
  entity_type           TEXT NOT NULL,
  entity_id             TEXT NOT NULL,
  decision              TEXT NOT NULL,
  reason_codes_json     TEXT NOT NULL DEFAULT '[]',
  metrics_snapshot_json TEXT NOT NULL DEFAULT '{}',
  recommendation_json   TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decisions_entity ON decisions(entity_type, entity_id, created_at);
