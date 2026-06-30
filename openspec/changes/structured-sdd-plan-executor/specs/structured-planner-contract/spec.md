## ADDED Requirements

### Requirement: Planner output uses versioned JSON Schema
The system SHALL require planner output to conform to a versioned JSON Schema before any dynamic execution plan is accepted.

#### Scenario: Valid structured plan is accepted
- **WHEN** a planner returns a JSON document matching the active `SessionExecutionPlan` schema
- **THEN** the system persists the plan with its schema version and planner version
- **AND** the executor may schedule nodes from that plan

#### Scenario: Invalid structured plan is rejected
- **WHEN** planner output is missing required fields, contains unsupported node types, or violates dependency/artifact schema rules
- **THEN** the system rejects the plan before execution
- **AND** the validation errors are persisted in session state and exposed to the UI

### Requirement: Node type registry defines executable contracts
The system SHALL register every executable node type with input schema, output schema, dependency rules, artifact contract, resource requirements, and replan policy.

#### Scenario: Planner references registered node type
- **WHEN** a plan node references a node type in the registry
- **THEN** the validator checks the node payload against that node type's schema
- **AND** the executor dispatches the node only through the registered runner

#### Scenario: Planner references unknown node type
- **WHEN** a plan node references a node type that is not registered
- **THEN** the plan is invalid
- **AND** no runner is invoked for that node

### Requirement: Requirement ownership confirmation emits machine-readable surfaces
The system SHALL store requirement ownership confirmation as both human-readable review content and structured machine-readable implementation surfaces.

#### Scenario: User confirms feature ownership
- **WHEN** the user confirms requirement ownership
- **THEN** the system records feature inventory, project ownership, implementation surfaces, unresolved questions, and confirmation decisions as structured data
- **AND** the planner consumes the structured data before using capability or legacy fallback evidence

#### Scenario: Legacy confirmation lacks structured surfaces
- **WHEN** a historical run has only prose or Markdown confirmation artifacts
- **THEN** the planner may use compatibility parsing
- **AND** the plan records that legacy fallback evidence was used

### Requirement: Structured output is the primary planner path
The system SHALL request structured output from model providers when planner output is needed.

#### Scenario: Provider supports structured output
- **WHEN** the selected provider supports function calling, JSON mode, or equivalent structured output
- **THEN** the planner request uses the structured-output mode
- **AND** the response is validated directly against the planner schema

#### Scenario: Provider returns non-JSON output
- **WHEN** a planner response is not parseable as JSON
- **THEN** the planner attempt fails with a validation error
- **AND** the system may retry according to bounded retry policy without executing the invalid output
