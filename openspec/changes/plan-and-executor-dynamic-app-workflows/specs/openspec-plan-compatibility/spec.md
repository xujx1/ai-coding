## ADDED Requirements

### Requirement: OpenSpec artifacts for dynamic plans
The system SHALL keep OpenSpec proposal, design, tasks, and specs artifacts compatible with dynamic application plans.

#### Scenario: App branch creates OpenSpec change
- **WHEN** a planned application branch reaches spec generation
- **THEN** the system writes a project-scoped OpenSpec change under that app artifact directory
- **AND** the change id remains stable for the session/app pair

#### Scenario: Fullstack app records track sections
- **WHEN** an application branch contains backend and frontend tracks
- **THEN** its OpenSpec tasks include track-specific sections
- **AND** task sections remain readable by existing OpenSpec tooling

### Requirement: Task completion synchronization
The system SHALL update OpenSpec task completion state from dynamic node execution.

#### Scenario: Backend implementation completes
- **WHEN** a backend implementation node completes successfully
- **THEN** backend development tasks in the app OpenSpec tasks artifact are marked completed
- **AND** unrelated frontend/test tasks remain unchanged

#### Scenario: Frontend tests complete
- **WHEN** a frontend test node completes successfully
- **THEN** frontend test tasks in the app OpenSpec tasks artifact are marked completed
- **AND** backend implementation tasks are not modified by that event

### Requirement: OpenSpec archive compatibility
The archive SHALL link dynamic branch and track outputs back to OpenSpec artifacts.

#### Scenario: Archive contains OpenSpec mapping
- **WHEN** a dynamic session is archived
- **THEN** archive metadata includes each app branch, track summary, OpenSpec change id, task artifact paths, and task completion status

### Requirement: Legacy OpenSpec compatibility
The system SHALL preserve existing single-chain OpenSpec behavior for legacy and historical sessions.

#### Scenario: Historical fixed-node run remains readable
- **WHEN** a run lacks dynamic plan metadata
- **THEN** existing OpenSpec artifacts and task state remain readable
- **AND** no dynamic track metadata is required to render the run
