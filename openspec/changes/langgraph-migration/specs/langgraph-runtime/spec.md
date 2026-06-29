## ADDED Requirements

### Requirement: Feature-flagged LangGraph runtime
The system SHALL support selecting the pipeline runtime through configuration while preserving the legacy runtime as a fallback.

#### Scenario: Legacy runtime remains default during migration
- **WHEN** no runtime feature flag is set
- **THEN** new runs use the legacy pipeline runtime
- **AND** existing behavior remains unchanged

#### Scenario: LangGraph runtime starts a new run
- **WHEN** `AI_CODING_WORKFLOW_RUNTIME` is set to `langgraph`
- **THEN** new runs are started through the LangGraph runtime
- **AND** the run uses `thread_id` equal to the run id

### Requirement: LangGraph checkpoint persistence
The LangGraph runtime SHALL persist durable checkpoints under the run directory using atomic file writes.

#### Scenario: Latest checkpoint is written
- **WHEN** the LangGraph runtime advances graph state
- **THEN** it writes checkpoint files under `runs/<runId>/langgraph/checkpoints/`
- **AND** it updates `latest.json` using a temp-file-then-rename strategy

#### Scenario: Run resumes after process restart
- **WHEN** the server restarts after a LangGraph run reaches a checkpoint
- **THEN** resume uses the latest checkpoint for the same run id
- **AND** the run can continue without requiring a legacy engine state reconstruction

### Requirement: ExecutionState read-model synchronization
The LangGraph runtime SHALL synchronize graph state to `execution-state.json` for every product-visible state transition.

#### Scenario: Node start synchronizes read model
- **WHEN** a LangGraph node starts
- **THEN** `execution-state.json` records the current node id, node status, and updated timestamp

#### Scenario: Completion synchronizes read model
- **WHEN** a LangGraph run completes
- **THEN** `execution-state.json` records completed status, completed timestamp, node states, artifact index, context manifests, and project state

### Requirement: Event bridge compatibility
The LangGraph runtime SHALL emit existing `PipelineEvent`-compatible events to `logs/events.ndjson` and WebSocket clients.

#### Scenario: Stage events are bridged
- **WHEN** a LangGraph stage node starts and completes
- **THEN** the event log contains compatible start and end events for the corresponding pipeline node
- **AND** WebSocket clients receive events usable by the existing UI

#### Scenario: Agent events remain compatible
- **WHEN** a LangGraph stage runner invokes `AgentEngine`
- **THEN** agent, tool, model, and artifact events continue to be written to `events.ndjson`
- **AND** the frontend can replay them after refresh

### Requirement: Stage runner reuse
The system SHALL extract current pipeline node business execution into reusable stage runners that both legacy and LangGraph runtimes can call during migration.

#### Scenario: Legacy runtime uses extracted runner
- **WHEN** a legacy run executes a migrated stage
- **THEN** it calls the extracted runner
- **AND** observable artifacts, events, and state remain compatible with pre-migration behavior

#### Scenario: LangGraph stage wrapper uses extracted runner
- **WHEN** a LangGraph stage node executes
- **THEN** it creates a stage runner context and calls the same runner used by the legacy path
- **AND** runner results are merged into graph state and the read model

### Requirement: Confirmation interrupt and resume
The LangGraph runtime SHALL implement confirmation gates through dedicated interrupt-capable confirmation nodes.

#### Scenario: Approval resumes next node
- **WHEN** a confirmation node interrupts and the user approves
- **THEN** the runtime resumes using a serializable decision payload
- **AND** execution proceeds to the next workflow node

#### Scenario: Rejection with feedback reruns source stage
- **WHEN** a confirmation node interrupts and the user rejects with feedback
- **THEN** the runtime records the feedback
- **AND** routing returns to the source stage for re-execution

#### Scenario: Rejection without feedback cancels run
- **WHEN** a confirmation node interrupts and the user rejects without feedback
- **THEN** the runtime marks the run cancelled
- **AND** the read model and event log reflect cancellation

### Requirement: Idempotent runtime side effects
The LangGraph runtime SHALL prevent duplicate product-visible side effects when nodes are retried or resumed after interrupt.

#### Scenario: Duplicate confirmation event is suppressed
- **WHEN** a confirmation node is re-entered for the same waiting decision
- **THEN** duplicate `confirmation_waiting` events are not appended
- **AND** the read model remains consistent

#### Scenario: Artifact writes use deterministic paths
- **WHEN** a stage is retried or resumed
- **THEN** artifacts are written to deterministic paths
- **AND** artifact indexes point to the latest valid output for each stage

### Requirement: Rollback router behavior
The LangGraph runtime SHALL route rollback and retry decisions through explicit router nodes that inspect state and artifacts without performing business side effects.

#### Scenario: Java review blocked routes to implementation
- **WHEN** Java review findings indicate blocking implementation issues
- **THEN** the router routes execution back to `java-impl`
- **AND** downstream node states are reset according to rollback rules

#### Scenario: Test failure routes to corrective node
- **WHEN** test failure classification identifies implementation, test-code, or coverage failure
- **THEN** the router selects the configured corrective node
- **AND** retry counters are updated in graph state and the read model

### Requirement: Historical and demo compatibility
The system SHALL keep historical runs and existing demo fixtures readable without LangGraph checkpoint files.

#### Scenario: Historical run opens without checkpoint
- **WHEN** a run directory contains `execution-state.json` but no LangGraph checkpoint
- **THEN** the UI can still display the run
- **AND** the system does not require checkpoint migration for read-only access

#### Scenario: Demo fixture remains compatible
- **WHEN** the existing full-flow demo fixture is injected
- **THEN** it remains readable under the legacy run structure
- **AND** LangGraph-specific fixture support is additive
