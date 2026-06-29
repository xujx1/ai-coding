## ADDED Requirements

### Requirement: Session-scoped execution planning
The system SHALL generate a session-scoped execution plan after upload initialization and requirement decomposition.

#### Scenario: Planner creates application branch plans
- **WHEN** a session has uploaded project candidates and MRD ownership output
- **THEN** the planner creates branch plans only for affected applications
- **AND** the plan is persisted in the session workflow instance

#### Scenario: Plan does not mutate global template
- **WHEN** a session plan contains application branches and nested tracks
- **THEN** the reusable global workflow template remains unchanged
- **AND** the run-specific plan is stored only in session/runtime state

### Requirement: Bounded planner output
The system SHALL validate planner output against a bounded catalog of supported node and track types.

#### Scenario: Unsupported node type is rejected
- **WHEN** planner output contains a node type outside the allowed catalog
- **THEN** the plan is rejected before execution
- **AND** the session records a visible planning validation error

#### Scenario: Invalid dependency graph is rejected
- **WHEN** planner output contains a cycle or missing dependency
- **THEN** the plan is rejected before execution
- **AND** no branch executor starts for that invalid plan

### Requirement: Nested application tracks
The planner SHALL support nested tracks inside an application branch when project capabilities and MRD impact require it.

#### Scenario: Fullstack app gets backend and frontend tracks
- **WHEN** an affected application has both backend and frontend capabilities
- **THEN** its branch plan includes backend and frontend implementation/test tracks
- **AND** the branch plan includes an app-level join before branch summary

#### Scenario: Backend-only app omits frontend track
- **WHEN** an affected application only has backend capability
- **THEN** its branch plan includes backend implementation and backend test nodes
- **AND** it does not include frontend implementation, frontend test, or E2E nodes

#### Scenario: Documentation-only app uses fallback track
- **WHEN** an affected application has no executable source/build capability
- **THEN** its branch plan uses documentation implementation and documentation test nodes
- **AND** the fallback reason is recorded in the plan evidence

### Requirement: Planner traceability
The system SHALL preserve planner inputs, evidence, validation result, and generated plan version for each session.

#### Scenario: User inspects plan source
- **WHEN** a user opens a planned dynamic session
- **THEN** the UI can show the planner source artifacts, capability evidence, included applications, and fallback reasons
