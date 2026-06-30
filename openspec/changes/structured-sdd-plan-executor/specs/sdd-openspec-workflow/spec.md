## ADDED Requirements

### Requirement: MRD confirmation maps to OpenSpec proposal
The system SHALL treat the uploaded MRD plus confirmed requirement ownership as the source for app-level OpenSpec `proposal.md`.

#### Scenario: App OpenSpec proposal is generated
- **WHEN** an application branch reaches OpenSpec generation
- **THEN** the generated `proposal.md` summarizes the confirmed MRD, feature inventory, ownership, and business acceptance boundaries
- **AND** the generation does not require `artifacts/prd.md`

#### Scenario: Legacy PRD exists
- **WHEN** a historical or legacy run contains `artifacts/prd.md`
- **THEN** the system may include it as supplemental context
- **AND** the MRD/confirmation source remains the primary proposal source for new SDD runs

### Requirement: Technical outputs map to OpenSpec design and spec
The system SHALL generate app-level OpenSpec `design.md` and `spec.md` from project technical design and structured node contracts.

#### Scenario: Project technical design exists
- **WHEN** `artifacts/<project>/tech-design.md` exists for an app branch
- **THEN** the OpenSpec `design.md` captures the implementation approach, affected modules, interfaces, data/config changes, risks, and rollback notes
- **AND** the OpenSpec `spec.md` captures testable behavioral requirements derived from the confirmed MRD and technical design

### Requirement: Generated task files map to OpenSpec tasks
The system SHALL create app-level OpenSpec `tasks.md` from generated development and test task files.

#### Scenario: Development and test task files exist
- **WHEN** `openspec-task.md` and `openspec-test-task.md` are generated for a project
- **THEN** the OpenSpec `tasks.md` includes the development tasks and test tasks in track-aware sections
- **AND** dynamic implementation and test nodes update only their corresponding task sections

### Requirement: SDD artifact contract is visible in session state
The system SHALL expose SDD artifact paths and source mappings in the session read model.

#### Scenario: User inspects branch artifacts
- **WHEN** a user selects an application branch
- **THEN** the UI can show the branch `proposal.md`, `design.md`, `spec.md`, `tasks.md`, generated task sources, and source MRD/confirmation artifact
- **AND** legacy `prd.md` is labeled as optional compatibility context when present
