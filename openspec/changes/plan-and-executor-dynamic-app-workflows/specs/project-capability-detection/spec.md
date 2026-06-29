## ADDED Requirements

### Requirement: Project capability snapshot
The system SHALL analyze uploaded project roots and persist a project capability snapshot for planning.

#### Scenario: Backend capability detected
- **WHEN** a project root contains Maven, Java source, Spring configuration, or equivalent backend signals
- **THEN** the capability snapshot records backend capability with evidence

#### Scenario: Frontend capability detected
- **WHEN** a project root contains frontend package metadata, Vite/Next config, frontend source, or browser test config
- **THEN** the capability snapshot records frontend capability with evidence

#### Scenario: Documentation-only capability detected
- **WHEN** a project root contains documentation files but no executable source/build signals
- **THEN** the capability snapshot records documentation-only capability
- **AND** the planner may route the app to documentation fallback nodes

### Requirement: Capability confidence and evidence
The system SHALL store confidence and evidence for each detected capability.

#### Scenario: Ambiguous capability requires fallback or confirmation
- **WHEN** capability confidence is below the configured threshold
- **THEN** the planner records the ambiguity
- **AND** the system either falls back conservatively or requests user confirmation according to policy

### Requirement: MRD impact combines with capability detection
The system SHALL combine MRD ownership with project capability detection to select relevant tracks.

#### Scenario: Frontend exists but MRD only affects backend
- **WHEN** an application has frontend and backend capabilities
- **AND** MRD ownership only references backend data flow
- **THEN** the planner may omit frontend implementation nodes
- **AND** the omission reason is recorded in the plan evidence

#### Scenario: MRD crosses frontend and backend
- **WHEN** MRD ownership references UI behavior and backend API changes
- **THEN** the planner includes frontend, backend, and contract tracks for that application
