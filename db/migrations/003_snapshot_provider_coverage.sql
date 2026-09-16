ALTER TABLE intelligence_snapshots ADD COLUMN IF NOT EXISTS provider_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE intelligence_snapshots ADD COLUMN IF NOT EXISTS provider_coverage_known boolean NOT NULL DEFAULT false;
