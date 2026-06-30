## ADDED Requirements

### Requirement: Browser E2E verification
The system SHALL provide an `e2e-verify` runner that verifies generated frontend and fullstack application behavior through browser-level interaction.

#### Scenario: E2E runner verifies a trusted frontend startup
- **WHEN** an affected application has frontend capability and a trusted startup path
- **THEN** the system runs browser verification for that application
- **AND** the verification executes against the live frontend URL for the session

#### Scenario: Project-owned Playwright configuration is used
- **WHEN** an affected application contains a project-owned `playwright.config.*`
- **THEN** the system may execute the project-owned Playwright configuration
- **AND** the resulting report is indexed under the application E2E artifacts

#### Scenario: Platform harness is used when project tests are absent
- **WHEN** an affected frontend application has no project-owned Playwright configuration
- **THEN** the system uses a platform-owned Playwright harness
- **AND** the harness derives browser checks from available MRD, OpenSpec, route, and UI evidence

### Requirement: Frontend local tests remain separate from E2E verification
The system SHALL keep project-local frontend checks separate from browser E2E verification.

#### Scenario: Frontend test runs project-local checks
- **WHEN** the `frontend-test` node runs
- **THEN** it executes local frontend checks such as build, lint, unit tests, or component tests
- **AND** it does not require browser E2E verification to be present

#### Scenario: E2E verification runs after frontend local checks
- **WHEN** an application plan includes both `frontend-test` and `e2e-verify`
- **THEN** `e2e-verify` runs only after required frontend local checks reach a successful terminal state

### Requirement: E2E verification artifacts
The system SHALL persist browser verification artifacts under the application artifact scope.

#### Scenario: Browser verification completes
- **WHEN** `e2e-verify` reaches a terminal state
- **THEN** the system writes an E2E verification summary
- **AND** the system indexes available Playwright reports, screenshots, traces, console diagnostics, network diagnostics, and failure classification artifacts

#### Scenario: Browser verification captures failure evidence
- **WHEN** a browser verification assertion, navigation, request, or startup step fails
- **THEN** the system captures enough evidence to inspect the failure after the run
- **AND** completed sibling track artifacts remain visible and unchanged

### Requirement: E2E fallback behavior
The system SHALL degrade browser verification gracefully when no trusted startup path exists.

#### Scenario: No trusted startup path exists
- **WHEN** an affected frontend application has no trusted startup command or framework convention
- **THEN** `e2e-verify` records a verification fallback reason
- **AND** the application branch is not failed solely because browser startup is unsupported

#### Scenario: Startup confidence is ambiguous
- **WHEN** startup evidence is below the configured confidence threshold
- **THEN** the system records the ambiguity
- **AND** it either uses the configured fallback policy or waits for confirmation before browser execution

### Requirement: E2E failure classification
The system SHALL classify browser verification failures so rerun and rollback can target the correct dynamic track.

#### Scenario: Frontend behavior fails
- **WHEN** browser verification fails because of UI rendering, routing, selector, client validation, or browser assertion behavior
- **THEN** the failure classification is `frontend`
- **AND** rerun can target the frontend track without overwriting completed backend artifacts

#### Scenario: Backend behavior fails
- **WHEN** browser verification fails because a backend service cannot start, cannot become ready, returns unexpected 5xx responses, or crashes during verification
- **THEN** the failure classification is `backend`

#### Scenario: Contract behavior fails
- **WHEN** browser verification or API smoke detects a missing endpoint, incompatible payload, schema mismatch, or DTO incompatibility
- **THEN** the failure classification is `contract`

#### Scenario: Environment behavior fails
- **WHEN** verification fails because of missing dependencies, port conflicts, command unavailability, sandbox limits, or infrastructure timeouts
- **THEN** the failure classification is `environment`
- **AND** the branch summary distinguishes the failure from a generated product defect

