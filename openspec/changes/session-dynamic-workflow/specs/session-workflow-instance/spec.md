## ADDED Requirements

### Requirement: Session-bound workflow instance
The system SHALL persist a run-specific workflow instance for each session that represents the actual execution graph for that run.

#### Scenario: New run captures session workflow instance
- **WHEN** a new run is created
- **THEN** the run state includes a session workflow instance with an immutable template snapshot reference
- **AND** the instance is stored in `execution-state.json`
- **AND** the instance is separate from the reusable global workflow definition

#### Scenario: Run-specific branches do not mutate template
- **WHEN** a run creates project branch instances
- **THEN** the global workflow definition remains unchanged
- **AND** branch instance data is stored only in the run state or runtime checkpoint for that run

### Requirement: Dynamic top-level run graph
The system SHALL represent dynamic multi-project runs as a top-level graph containing orchestration nodes rather than the fixed project implementation stages.

#### Scenario: Multi-project run uses fanout graph
- **WHEN** a run has one or more affected project branches after requirement decomposition
- **THEN** the session workflow instance contains top-level nodes for upload/init, requirement decomposition, project fanout, join, cross-application review, and archive
- **AND** project-scoped implementation stages are represented under branch instances

#### Scenario: Single-project run still uses branch instance
- **WHEN** a run has exactly one affected project
- **THEN** the session workflow instance still contains a project fanout node and one branch instance
- **AND** the UI can display the branch workflow without reverting to the fixed linear stage list

### Requirement: Branch instance state
The system SHALL store branch-local node state for each affected project branch.

#### Scenario: Branch stores project-scoped nodes
- **WHEN** fanout creates a branch for an affected project
- **THEN** the branch state includes nodes for implementation planning, spec generation, Java implementation, test-code generation, test execution, and branch summary
- **AND** each branch node tracks status, current node, artifacts, child agents, retry counters, and errors independently

#### Scenario: Branch artifacts remain project-scoped
- **WHEN** a branch node writes artifacts
- **THEN** artifacts are written under project-scoped artifact paths
- **AND** the branch artifact index references only artifacts for that branch

### Requirement: Join and aggregate review state
The system SHALL represent join and cross-application review as session workflow nodes after branch execution.

#### Scenario: Join waits for branches
- **WHEN** one or more required branches are not terminal
- **THEN** the join node remains waiting
- **AND** the join state records waiting, completed, failed, and cancelled branch ids

#### Scenario: Cross-application review follows join
- **WHEN** the join reaches a policy-accepted terminal state
- **THEN** execution proceeds to cross-application review nodes
- **AND** review findings link back to affected branch ids

### Requirement: Session graph rendering
The frontend SHALL render the current session workflow instance before falling back to global or legacy definitions.

#### Scenario: Top pipeline bar follows session graph
- **WHEN** a session has a workflow instance
- **THEN** the top pipeline bar renders the session instance's top-level nodes
- **AND** it does not render the fixed global `PIPELINE_NODES` list unless the session lacks instance data

#### Scenario: Workflow view shows branch lanes
- **WHEN** a user opens the workflow view for a dynamic run
- **THEN** the view displays fanout, branch lanes, branch node statuses, join state, and cross-application findings from the session read model
- **AND** runtime status is overlaid from `execution-state.json`

#### Scenario: Historical fixed-node run remains readable
- **WHEN** a historical run has no session workflow instance
- **THEN** the frontend renders the legacy fixed-node layout
- **AND** the run remains readable without generating new branch instance state

### Requirement: Branch control APIs
The system SHALL expose branch-scoped controls when runtime state permits rerun or cancellation.

#### Scenario: Rerun failed branch only
- **WHEN** a branch is failed or waiting for fix and runtime state permits rerun
- **THEN** the branch rerun API schedules only that branch from the requested branch node
- **AND** completed unaffected branches remain completed

#### Scenario: Cancel active branch only
- **WHEN** a branch is active and runtime state permits branch cancellation
- **THEN** the branch cancellation API marks that branch cancelled or interrupted
- **AND** the whole run continues or fails according to the configured branch failure policy

#### Scenario: Whole-run cancellation updates branches
- **WHEN** a user cancels the whole run
- **THEN** active branches are marked cancelled or interrupted
- **AND** the session workflow instance and event log reflect whole-run cancellation
