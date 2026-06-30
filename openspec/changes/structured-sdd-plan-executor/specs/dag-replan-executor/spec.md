## ADDED Requirements

### Requirement: Dynamic plans execute as dependency DAGs
The executor SHALL schedule dynamic execute nodes according to explicit dependency edges in the validated plan.

#### Scenario: Independent nodes run concurrently
- **WHEN** two nodes have all dependencies satisfied and do not depend on each other
- **THEN** the executor may run them concurrently subject to resource limits
- **AND** each node records status, timings, artifacts, and child agent ids independently

#### Scenario: Dependency is not satisfied
- **WHEN** a node depends on an incomplete, failed, or invalidated node
- **THEN** the executor does not run that node
- **AND** the node remains pending, blocked, or waiting for fix according to the dependency state

### Requirement: Resource concurrency limits are enforced
The executor SHALL enforce branch, model, command, browser, and tool resource limits during dynamic plan execution.

#### Scenario: Browser nodes exceed browser limit
- **WHEN** multiple E2E verification nodes are runnable and browser capacity is exhausted
- **THEN** only the configured number of browser nodes run
- **AND** remaining browser nodes wait without blocking unrelated non-browser nodes

#### Scenario: Model nodes exceed model limit
- **WHEN** multiple model-backed nodes are runnable and model capacity is exhausted
- **THEN** additional model nodes queue until capacity is available
- **AND** command-only nodes may continue if their own limits allow it

### Requirement: Replan updates only remaining work
The system SHALL support bounded replan requests that replace only pending, failed, or invalidated subgraphs.

#### Scenario: Frontend track fails after backend completes
- **WHEN** a frontend track node fails and backend track nodes are completed
- **THEN** the replan request includes completed backend nodes as locked context
- **AND** the replanner may replace only the failed frontend node and downstream pending nodes unless the user explicitly invalidates backend work

#### Scenario: Replan exceeds fuse limit
- **WHEN** a branch or session exceeds the configured maximum replan attempts
- **THEN** the runtime stops replanning
- **AND** the session records a terminal failure summary with the last validation or execution error

### Requirement: Plan revisions are persisted and auditable
The system SHALL persist each accepted plan revision and connect execution state to the revision that produced each node.

#### Scenario: Replan creates new revision
- **WHEN** a replan is accepted
- **THEN** the system records a new plan revision id, parent revision id, changed nodes, locked nodes, and validation result
- **AND** the UI can show which revision produced the currently selected node
