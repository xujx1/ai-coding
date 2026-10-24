-- Keep this additive migration for deployments that applied the original
-- storage schema before outbox claiming was introduced.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_by TEXT;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS terminal_failed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS outbox_events_claim_idx ON outbox_events (claimed_until)
  WHERE published_at IS NULL AND terminal_failed_at IS NULL;
