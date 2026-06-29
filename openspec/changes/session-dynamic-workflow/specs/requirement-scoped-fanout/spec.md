## ADDED Requirements

### Requirement: Uploaded project manifest fanout input
The system SHALL use the uploaded project manifest as the base candidate set for dynamic project fanout.

#### Scenario: Uploaded folders become fanout candidates
- **WHEN** upload initialization detects multiple project folders
- **THEN** the project manifest lists each project with a stable name and root
- **AND** fanout may create at most one branch per listed project

#### Scenario: No project candidate fails visibly
- **WHEN** fanout has no project candidates
- **THEN** the run marks the fanout node failed or waits for user correction
- **AND** the reason is visible in `execution-state.json`

### Requirement: MRD ownership affects branch selection
The system SHALL use requirement decomposition output to select the subset of uploaded projects affected by the MRD.

#### Scenario: MRD selects subset of projects
- **WHEN** the requirement decomposition identifies affected project ownership for a subset of uploaded projects
- **THEN** fanout creates branches only for the affected projects
- **AND** non-affected uploaded projects remain listed as excluded with a reason

#### Scenario: MRD ownership is uncertain
- **WHEN** the system cannot confidently map MRD changes to uploaded projects
- **THEN** fanout falls back to all uploaded projects
- **AND** the fallback reason is recorded in a fanout decision artifact and session read model

#### Scenario: MRD references missing project
- **WHEN** requirement decomposition references a project that was not uploaded
- **THEN** fanout records the missing project as unresolved
- **AND** the run waits for correction or fails according to configured policy

### Requirement: Fanout decision artifact
The system SHALL write a structured fanout decision artifact for each run.

#### Scenario: Fanout decision records included projects
- **WHEN** fanout completes branch selection
- **THEN** it writes an artifact containing candidate projects, included projects, excluded projects, unresolved projects, source evidence, confidence, and fallback reason if any
- **AND** the artifact is indexed in the session artifact index

#### Scenario: UI can inspect fanout decision
- **WHEN** a user opens the fanout node or workflow branch view
- **THEN** the UI can display the fanout decision artifact and included/excluded project lists

### Requirement: Branch execution concurrency
The system SHALL execute affected branches according to configured branch, model, and command concurrency limits.

#### Scenario: Branch limit queues extra branches
- **WHEN** more affected branches are ready than the configured branch concurrency limit
- **THEN** only the allowed number of branches run concurrently
- **AND** remaining branches remain queued or pending until capacity is available

#### Scenario: Command limit applies across branches
- **WHEN** multiple branches need Maven compile or test commands
- **THEN** command execution is limited across all branches according to the configured test concurrency limit
- **AND** branch state reflects waiting or running status accurately

### Requirement: Branch-scoped rollback
The system SHALL route branch-scoped failures back to only affected branches whenever possible.

#### Scenario: Branch test failure reruns one branch
- **WHEN** one branch fails due to implementation or test-code issues
- **THEN** only that branch is routed back to the required branch node
- **AND** completed unaffected branches remain completed

#### Scenario: Cross-app finding affects selected branches
- **WHEN** cross-application review identifies affected branch ids
- **THEN** only those branches are marked waiting for fix
- **AND** the required target node is recorded per affected branch

#### Scenario: Planning issue invalidates all branches
- **WHEN** cross-application review identifies a planning-level issue
- **THEN** the main workflow routes back to the planning node
- **AND** downstream branch state is reset or invalidated consistently

### Requirement: Dynamic workflow compatibility
The system SHALL preserve existing read contracts while adding requirement-scoped fanout behavior.

#### Scenario: Events remain WebSocket-compatible
- **WHEN** fanout, branch nodes, join, or branch rollback update state
- **THEN** compatible pipeline events are written to `logs/events.ndjson`
- **AND** existing WebSocket clients can refresh the session from `execution-state.json`

#### Scenario: Archive aggregates branch outputs
- **WHEN** a dynamic run reaches archive
- **THEN** the archive includes branch summaries, cross-application review artifacts, fanout decision metadata, and delivery package metadata
