CREATE TABLE IF NOT EXISTS intelligence_runs (
  run_id uuid PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  requested_providers jsonb NOT NULL,
  handle_set_version integer,
  status text NOT NULL CHECK (status IN ('running','promoted','no_change','failed')),
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS intelligence_events (
  event_id text PRIMARY KEY,
  canonical_key text NOT NULL,
  player_id text,
  event_type text NOT NULL,
  current_revision_hash text NOT NULL,
  first_reported_at timestamptz NOT NULL,
  last_updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS intelligence_event_revisions (
  revision_hash text PRIMARY KEY,
  event_id text NOT NULL REFERENCES intelligence_events(event_id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_observations (
  observation_fingerprint text PRIMARY KEY,
  provider_id text NOT NULL,
  provider_item_id text,
  canonical_url text,
  x_post_id text,
  author text,
  x_handle text,
  published_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  event_id text NOT NULL REFERENCES intelligence_events(event_id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider_id, provider_item_id)
);

CREATE TABLE IF NOT EXISTS intelligence_snapshots (
  snapshot_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES intelligence_runs(run_id),
  status text NOT NULL CHECK (status IN ('accepted','superseded','rolled_back')),
  content_hash text NOT NULL,
  provider_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_coverage_known boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_snapshot_events (
  snapshot_id uuid NOT NULL REFERENCES intelligence_snapshots(snapshot_id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES intelligence_events(event_id),
  revision_hash text NOT NULL REFERENCES intelligence_event_revisions(revision_hash),
  PRIMARY KEY (snapshot_id, event_id)
);

CREATE TABLE IF NOT EXISTS intelligence_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_snapshot_id uuid REFERENCES intelligence_snapshots(snapshot_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_quarantine (
  quarantine_id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES intelligence_runs(run_id),
  reason_code text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO intelligence_state (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_intelligence_events_updated ON intelligence_events (last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_observations_event ON intelligence_observations (event_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_runs_started ON intelligence_runs (started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intelligence_one_running ON intelligence_runs ((status)) WHERE status='running';
