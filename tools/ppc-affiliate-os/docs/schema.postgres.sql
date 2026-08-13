-- PPC Affiliate OS v0.2 / PostgreSQL スキーマ
-- 既定は SQLite（backend/app/db/schema.sqlite.sql）。列構成はこちらと揃えてある。
-- 規模が大きくなったらこちらへ移行する。

CREATE TABLE IF NOT EXISTS offers (
  id                        UUID PRIMARY KEY,
  name                      TEXT NOT NULL,
  asp_name                  TEXT,
  payout                    NUMERIC(12,2) NOT NULL,
  approval_rate             NUMERIC(8,6) NOT NULL DEFAULT 1.0,
  advertiser_cvr            NUMERIC(8,6) NOT NULL,
  advertiser_cvr_confidence NUMERIC(8,6) NOT NULL DEFAULT 1.0,
  conversion_point          TEXT,
  target_roas               NUMERIC(8,4) NOT NULL DEFAULT 1.5,
  max_test_budget           NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_test_clicks           INTEGER NOT NULL DEFAULT 100,
  stop_after_zero_cv_clicks INTEGER NOT NULL DEFAULT 200,
  scale_roas_multiplier     NUMERIC(8,4) NOT NULL DEFAULT 1.2,
  official_url              TEXT,
  asp_url                   TEXT,
  status                    TEXT NOT NULL DEFAULT 'TEST',
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_rules (
  offer_id            UUID PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
  trademark_allowed   BOOLEAN NOT NULL DEFAULT FALSE,
  competitor_allowed  BOOLEAN NOT NULL DEFAULT FALSE,
  listing_allowed     BOOLEAN NOT NULL DEFAULT TRUE,
  geo_rules_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  age_rules_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_rules_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  negative_rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes               TEXT
);

CREATE TABLE IF NOT EXISTS keyword_candidates (
  id                  UUID PRIMARY KEY,
  offer_id            UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  keyword             TEXT NOT NULL,
  normalized_keyword  TEXT NOT NULL,
  match_type          TEXT,
  intent              TEXT,
  cluster             TEXT,
  bucket              TEXT,
  conversion_distance NUMERIC(6,2),
  commercial_intent   NUMERIC(6,2),
  noise_risk          NUMERIC(6,2),
  ai_estimated_lp_ctr NUMERIC(8,6),
  ai_confidence       NUMERIC(8,6),
  priority_score      NUMERIC(8,2),
  required_lp_ctr     NUMERIC(10,6),
  cpc_headroom        NUMERIC(10,4),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (offer_id, normalized_keyword)
);

CREATE TABLE IF NOT EXISTS keyword_metrics (
  keyword_candidate_id UUID PRIMARY KEY REFERENCES keyword_candidates(id) ON DELETE CASCADE,
  avg_monthly_searches BIGINT,
  competition          TEXT,
  competition_index    INTEGER,
  low_bid              NUMERIC(12,2),
  high_bid             NUMERIC(12,2),
  forecast_impressions NUMERIC(14,4),
  forecast_clicks      NUMERIC(14,4),
  forecast_cpc         NUMERIC(12,2),
  forecast_cost        NUMERIC(14,2),
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                         UUID PRIMARY KEY,
  offer_id                   UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  google_customer_id         TEXT,
  google_campaign_id         TEXT,
  name                       TEXT,
  conversion_action_resource TEXT
);

CREATE TABLE IF NOT EXISTS ad_stats_daily (
  date             DATE NOT NULL,
  offer_id         UUID REFERENCES offers(id) ON DELETE CASCADE,
  campaign_id      TEXT NOT NULL DEFAULT '',
  ad_group_id      TEXT NOT NULL DEFAULT '',
  criterion_id     TEXT NOT NULL DEFAULT '',
  keyword_text     TEXT,
  match_type       TEXT,
  impressions      BIGINT NOT NULL DEFAULT 0,
  clicks           BIGINT NOT NULL DEFAULT 0,
  cost             NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions      NUMERIC(14,4) NOT NULL DEFAULT 0,
  conversion_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, offer_id, campaign_id, ad_group_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS search_terms_daily (
  date             DATE NOT NULL,
  offer_id         UUID REFERENCES offers(id) ON DELETE CASCADE,
  campaign_id      TEXT NOT NULL DEFAULT '',
  ad_group_id      TEXT NOT NULL DEFAULT '',
  search_term      TEXT NOT NULL,
  impressions      BIGINT NOT NULL DEFAULT 0,
  clicks           BIGINT NOT NULL DEFAULT 0,
  cost             NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversions      NUMERIC(14,4) NOT NULL DEFAULT 0,
  conversion_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, offer_id, campaign_id, ad_group_id, search_term)
);

CREATE TABLE IF NOT EXISTS lp_click_events (
  id             UUID PRIMARY KEY,
  occurred_at    TIMESTAMPTZ NOT NULL,
  offer_id       UUID REFERENCES offers(id) ON DELETE SET NULL,
  session_id     TEXT,
  gclid          TEXT,
  wbraid         TEXT,
  gbraid         TEXT,
  campaign_id    TEXT,
  ad_group_id    TEXT,
  keyword        TEXT,
  match_type     TEXT,
  device         TEXT,
  landing_page   TEXT,
  cta_name       TEXT,
  client_ip_hash TEXT   -- 生IPは保存しない
);

CREATE INDEX IF NOT EXISTS idx_lp_click_offer_time ON lp_click_events(offer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_lp_click_gclid ON lp_click_events(gclid);
CREATE INDEX IF NOT EXISTS idx_lp_click_session ON lp_click_events(session_id);

CREATE TABLE IF NOT EXISTS approvals (
  id               UUID PRIMARY KEY,
  offer_id         UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  conversion_date  DATE NOT NULL,
  count            NUMERIC(14,4) NOT NULL DEFAULT 0,
  approved_count   NUMERIC(14,4) NOT NULL DEFAULT 0,
  rejected_count   NUMERIC(14,4) NOT NULL DEFAULT 0,
  approved_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  source           TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_offer_date ON approvals(offer_id, conversion_date);

CREATE TABLE IF NOT EXISTS decisions (
  id                    UUID PRIMARY KEY,
  entity_type           TEXT NOT NULL,
  entity_id             TEXT NOT NULL,
  decision              TEXT NOT NULL,
  reason_codes_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_entity ON decisions(entity_type, entity_id, created_at DESC);
