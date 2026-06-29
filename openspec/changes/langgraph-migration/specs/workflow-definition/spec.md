## ADDED Requirements

### Requirement: Built-in workflow definition
The system SHALL provide a built-in MRD-to-Code `WorkflowDefinition` derived from the existing pipeline stages and preserving the legacy stage identifiers used by current runs.

#### Scenario: Built-in workflow mirrors the pipeline
- **WHEN** the built-in workflow definition is requested
- **THEN** the workflow contains nodes corresponding to `upload-init`, `mrd-render`, `implementation-plan`, `spec-generate`, `java-impl`, `testcode-generate`, and `archive`
- **AND** the workflow contains edges matching the default MRD-to-Code execution order

#### Scenario: Confirmation gates are represented explicitly
- **WHEN** the built-in workflow is generated
- **THEN** confirmation-capable stages are represented with explicit confirmation nodes or equivalent workflow metadata
- **AND** the resulting graph can distinguish business stage execution from user confirmation waiting state

### Requirement: Locked workflow visualization
The system SHALL expose a workflow view that renders the built-in workflow as a React Flow graph in locked mode before structural editing is enabled.

#### Scenario: Locked workflow prevents structural edits
- **WHEN** a user opens the default MRD-to-Code workflow view
- **THEN** the user cannot delete built-in stage nodes
- **AND** the user cannot delete required built-in edges
- **AND** the user cannot change the stage runner assigned to a built-in stage

#### Scenario: Locked workflow allows safe configuration edits
- **WHEN** a user edits allowed configuration for a built-in workflow node
- **THEN** the system permits changes to model override, max turns, prompt configuration, tools, skills, and confirmation gate settings
- **AND** the workflow structure remains unchanged

### Requirement: Workflow validation
The system SHALL validate workflow definitions before saving or launching a run.

#### Scenario: Missing required artifact chain is rejected
- **WHEN** a workflow removes a stage or edge required to produce downstream artifacts
- **THEN** validation fails with a message identifying the missing requirement
- **AND** the workflow cannot be used to start a run

#### Scenario: Invalid loop is rejected
- **WHEN** a workflow contains a cycle without an explicit max-step or retry bound
- **THEN** validation fails
- **AND** the workflow cannot be saved as launchable

### Requirement: Run-bound workflow snapshot
The system SHALL bind each new run to an immutable workflow snapshot so historical runs remain reproducible after workflow edits.

#### Scenario: Run uses snapshot after workflow changes
- **WHEN** a run is started from a workflow definition
- **AND** the workflow definition is later edited
- **THEN** the running or historical run continues to display and resume against the snapshot captured at start time

### Requirement: Workflow definition APIs
The system SHALL provide APIs for retrieving the default workflow and updating allowed configuration in the first migration phase.

#### Scenario: Default workflow is retrievable
- **WHEN** a client calls the default workflow API
- **THEN** the response includes nodes, edges, global configuration, lock state, version, and timestamps

#### Scenario: Configuration update persists
- **WHEN** a client updates allowed node configuration
- **THEN** the system persists the updated workflow definition
- **AND** subsequent reads return the updated configuration

### Requirement: Runtime state overlay
The workflow view SHALL render run state from `execution-state.json` without storing runtime status in the workflow definition.

#### Scenario: Node status updates during a run
- **WHEN** a run transitions a node from pending to running to completed
- **THEN** the workflow view overlays the node status from the session read model
- **AND** the workflow definition remains unchanged

#### Scenario: Historical run remains readable
- **WHEN** a historical run without a workflow snapshot is opened
- **THEN** the system derives a compatible default workflow view
- **AND** the run state remains readable from the existing `execution-state.json`
