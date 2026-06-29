## ADDED Requirements

### Requirement: Dynamic branch plan execution
The executor SHALL run validated branch plans using stable runner implementations from the supported node catalog.

#### Scenario: Executor dispatches planned node
- **WHEN** a planned node becomes runnable
- **THEN** the executor invokes the runner mapped to that node type
- **AND** the node status, timing, agent ids, and output artifacts are synchronized into session state

#### Scenario: Executor refuses unvalidated plan
- **WHEN** a session plan has not passed validation
- **THEN** the executor does not start branch nodes
- **AND** the session reports a planning failure

### Requirement: Track-level execution state
The executor SHALL track status independently for each application track and node.

#### Scenario: Backend track completes while frontend track runs
- **WHEN** a fullstack app has backend and frontend tracks running in parallel
- **THEN** the backend track can reach completed state independently
- **AND** the application branch remains non-terminal until all required tracks reach terminal state

#### Scenario: One track failure does not overwrite unrelated track artifacts
- **WHEN** a track node fails
- **THEN** only that track and dependent app join state are marked failed or waiting for fix
- **AND** completed sibling track artifacts remain indexed and visible

### Requirement: Controlled concurrency
The executor SHALL apply configured concurrency limits across branch, model, command, and browser execution.

#### Scenario: Branch concurrency limit queues applications
- **WHEN** runnable branches exceed the branch concurrency limit
- **THEN** only the configured number run concurrently
- **AND** remaining branches stay pending or queued

#### Scenario: Browser verification uses separate limit
- **WHEN** multiple frontend E2E verification nodes are runnable
- **THEN** browser execution is limited independently from backend command execution

### Requirement: Rerun and cancellation
The executor SHALL support rerun and cancellation at branch, track, and node scope when runtime state permits.

#### Scenario: Rerun frontend track only
- **WHEN** a frontend track fails and backend track is completed
- **THEN** the user can rerun the frontend track from the failed node
- **AND** backend track state and artifacts remain completed

#### Scenario: Cancel active application branch
- **WHEN** a user cancels an active application branch
- **THEN** active track nodes in that branch are cancelled or interrupted
- **AND** other application branches continue according to failure policy
