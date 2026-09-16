ALTER TABLE intelligence_snapshot_events ADD COLUMN IF NOT EXISTS revision_hash text;
UPDATE intelligence_snapshot_events se SET revision_hash=e.current_revision_hash FROM intelligence_events e WHERE e.event_id=se.event_id AND se.revision_hash IS NULL;
ALTER TABLE intelligence_snapshot_events ALTER COLUMN revision_hash SET NOT NULL;
ALTER TABLE intelligence_snapshot_events DROP CONSTRAINT IF EXISTS intelligence_snapshot_events_revision_hash_fkey;
ALTER TABLE intelligence_snapshot_events ADD CONSTRAINT intelligence_snapshot_events_revision_hash_fkey FOREIGN KEY (revision_hash) REFERENCES intelligence_event_revisions(revision_hash);
