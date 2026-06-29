## ADDED Requirements

### Requirement: Dynamic fanout from project manifest
The system SHALL create dynamic application branches at runtime from the project or application manifest rather than storing run-specific branches in the workflow definition.

#### Scenario: Fanout creates stable branch states
- **WHEN** a run reaches the application fanout node with multiple projects in the manifest
- **THEN** the runtime creates one stable branch state per project
- **AND** each branch has a stable branch id, project name, project root, workflow id, status, node states, artifact index, and retry state

#### Scenario: Empty fanout is handled
- **WHEN** the fanout node cannot resolve any project or application branch
- **THEN** the runtime marks the fanout as failed or waits for user correction
- **AND** the failure is visible in `execution-state.json`

### Requirement: Branch workflow execution
The system SHALL execute each application branch through a branch workflow containing project-scoped implementation, review, test, and summary stages.

#### Scenario: Branch runs project-scoped stages
- **WHEN** a branch starts
- **THEN** it executes project-scoped stages for spec generation, code implementation, code review, test-code generation, unit test, integration test, and branch summary as configured
- **AND** branch artifacts are written under project-scoped artifact paths

#### Scenario: Branch status maps to read model
- **WHEN** a branch node changes status
- **THEN** the branch status and current node are synchronized into the corresponding project state in `execution-state.json`
- **AND** the UI can drill down into branch node status

### Requirement: Branch concurrency limits
The system SHALL enforce branch, model, and command concurrency limits for multi-application execution.

#### Scenario: Branch concurrency limit is enforced
- **WHEN** more branches are ready than the configured branch concurrency limit
- **THEN** no more than the configured number of branches run at the same time
- **AND** remaining branches stay pending or queued

#### Scenario: Test concurrency limit is enforced
- **WHEN** multiple branches need Maven compile or test commands
- **THEN** the runtime limits concurrent command execution according to the configured test concurrency limit
- **AND** queued branch work resumes when capacity is available

### Requirement: Branch failure policy
The system SHALL support configurable branch failure policies for fanout execution.

#### Scenario: Continue and collect policy keeps other branches running
- **WHEN** one branch fails under `continue_and_collect`
- **THEN** other active or pending branches continue execution
- **AND** the join reports completed and failed branch ids

#### Scenario: Fail fast policy cancels pending branches
- **WHEN** one branch fails under `fail_fast`
- **THEN** pending branches are cancelled
- **AND** the run records the failure reason and affected branches

### Requirement: Join node aggregation
The system SHALL provide join nodes that wait for required branches and summarize branch completion before aggregate review.

#### Scenario: Join waits for required branches
- **WHEN** not all required branches have reached a terminal state
- **THEN** the join remains waiting
- **AND** it records waiting, completed, and failed branch ids

#### Scenario: Join proceeds after required branches complete
- **WHEN** all required branches have reached completed or policy-accepted terminal states
- **THEN** the join completes
- **AND** execution proceeds to cross-application review

### Requirement: Branch summary artifact
Each branch SHALL produce a structured summary artifact for cross-application review.

#### Scenario: Branch summary contains review inputs
- **WHEN** a branch completes implementation and tests
- **THEN** it writes a branch summary containing changed files, public API changes, database changes, configuration changes, dependency changes, test results, risk notes, and required cross-application checks

#### Scenario: Cross-application review reads summaries
- **WHEN** cross-application review starts
- **THEN** it reads branch summaries and required project-scoped artifacts
- **AND** it does not require loading complete agent transcripts for every branch

### Requirement: Cross-application review
The system SHALL perform aggregate review across application branches and produce structured findings mapped to affected branches.

#### Scenario: Contract mismatch blocks affected branches
- **WHEN** cross-application review finds an API, DTO, configuration, dependency, database, or release-order mismatch
- **THEN** it writes structured findings
- **AND** each finding identifies affected branch ids and required fixes

#### Scenario: Approved review proceeds to archive
- **WHEN** cross-application review approves all branches
- **THEN** execution proceeds toward archive
- **AND** the archive includes cross-application delivery metadata

### Requirement: Targeted cross-application rollback
The system SHALL roll back only affected branches by default when aggregate review identifies branch-scoped issues.

#### Scenario: Single branch rollback
- **WHEN** cross-application review blocks one branch
- **THEN** only the affected branch is routed back to the required target node
- **AND** completed unaffected branches remain completed

#### Scenario: Planning-level issue rolls back main workflow
- **WHEN** cross-application review determines the issue originates from requirement decomposition or implementation planning
- **THEN** the runtime routes the main workflow back to the configured planning node
- **AND** downstream branch state is reset or invalidated consistently

### Requirement: Multi-application UI drilldown
The UI SHALL present fanout nodes as expandable run-instance views with branch statuses, artifacts, and cross-application findings.

#### Scenario: Fanout node expands branches
- **WHEN** a user clicks a fanout node in a run view
- **THEN** the UI displays branch names, current nodes, statuses, and key artifacts

#### Scenario: Finding links to affected branch
- **WHEN** cross-application review produces a finding
- **THEN** the UI shows the finding with affected branch links
- **AND** selecting a branch opens branch-specific events and artifacts
