CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  requirement_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  current_node_id TEXT,
  current_node_index INTEGER NOT NULL,
  permission_mode TEXT NOT NULL,
  model_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_instance JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, run_id)
);
CREATE INDEX IF NOT EXISTS runs_tenant_updated_idx ON runs (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS runs_tenant_status_updated_idx ON runs (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS run_nodes (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, run_id, node_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS run_nodes_status_idx ON run_nodes (tenant_id, run_id, status);

CREATE TABLE IF NOT EXISTS run_projects (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  status TEXT NOT NULL,
  branch_id TEXT,
  current_node_id TEXT,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, run_id, project_name),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS run_projects_status_idx ON run_projects (tenant_id, run_id, status);

CREATE TABLE IF NOT EXISTS agent_runs (
  tenant_id TEXT NOT NULL,
  agent_run_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_model_id TEXT NOT NULL,
  current_provider_id TEXT NOT NULL,
  plan JSONB,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, agent_run_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_runs_by_run_idx ON agent_runs (tenant_id, run_id, started_at DESC);

CREATE TABLE IF NOT EXISTS lifecycle_states (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, run_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lifecycle_requirement_idx ON lifecycle_states (tenant_id, requirement_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS lifecycle_status_idx ON lifecycle_states (tenant_id, phase, status);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  tenant_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, workflow_id)
);

CREATE TABLE IF NOT EXISTS run_event_sequences (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  last_sequence BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, run_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  node_id TEXT,
  agent_run_id TEXT,
  payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  UNIQUE (tenant_id, run_id, sequence),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS run_events_cursor_idx ON run_events (tenant_id, run_id, sequence);

CREATE TABLE IF NOT EXISTS artifact_refs (
  tenant_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  producer_node_id TEXT,
  retention_class TEXT NOT NULL,
  committed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, artifact_id),
  UNIQUE (tenant_id, storage_key),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS artifact_refs_run_idx ON artifact_refs (tenant_id, run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_leases (
  tenant_id TEXT NOT NULL,
  lease_key TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  fencing_token BIGINT NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, lease_key)
);
CREATE INDEX IF NOT EXISTS execution_leases_expiry_idx ON execution_leases (lease_until);

CREATE TABLE IF NOT EXISTS idempotency_records (
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  outbox_id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  claimed_by TEXT,
  claimed_until TIMESTAMPTZ,
  terminal_failed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON outbox_events (next_attempt_at)
  WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS outbox_events_claim_idx ON outbox_events (claimed_until)
  WHERE published_at IS NULL AND terminal_failed_at IS NULL;

CREATE TABLE IF NOT EXISTS storage_migrations (
  tenant_id TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  target_schema_version TEXT NOT NULL,
  status TEXT NOT NULL,
  diagnostics JSONB,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_run_id, source_checksum)
);
