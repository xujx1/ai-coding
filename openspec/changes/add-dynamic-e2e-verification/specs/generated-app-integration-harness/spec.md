## ADDED Requirements

### Requirement: Session-scoped integration startup
The system SHALL start generated frontend and backend services in a session-scoped integration environment when trusted startup evidence exists.

#### Scenario: Fullstack app starts backend before frontend
- **WHEN** an affected application has backend and frontend tracks with trusted startup commands
- **THEN** the integration harness starts the backend service before the frontend service
- **AND** the frontend receives the session-scoped backend URL through temporary environment injection

#### Scenario: Ports are allocated per session
- **WHEN** the integration harness starts one or more application services
- **THEN** it allocates ports scoped to the session and app
- **AND** the startup manifest records the assigned service URLs

#### Scenario: Services are cleaned up
- **WHEN** integration verification reaches a terminal state or is cancelled
- **THEN** the system terminates services started by the integration harness
- **AND** the final startup manifest records cleanup status

### Requirement: Startup capability evidence
The system SHALL use project capability evidence to decide whether generated services can be started automatically.

#### Scenario: Trusted frontend startup is detected
- **WHEN** a project root contains known frontend scripts, framework config, or project-owned browser test configuration
- **THEN** the capability snapshot records frontend startup evidence
- **AND** the integration harness may start the frontend according to policy

#### Scenario: Trusted backend startup is detected
- **WHEN** a project root contains known backend launch scripts, build files, application entry points, or health endpoint evidence
- **THEN** the capability snapshot records backend startup evidence
- **AND** the integration harness may start the backend according to policy

#### Scenario: Startup is unsupported
- **WHEN** startup evidence is missing or below the configured confidence threshold
- **THEN** the integration harness does not guess arbitrary commands
- **AND** it records an unsupported startup reason in app-scoped artifacts

### Requirement: API base URL injection
The system SHALL wire generated frontend services to generated backend services without permanently mutating source files.

#### Scenario: Frontend API URL is injected
- **WHEN** the integration harness starts a frontend that depends on a backend
- **THEN** it injects the backend base URL through supported environment variable conventions or project-specific evidence
- **AND** the startup manifest records which convention was used

#### Scenario: Source files are not rewritten for verification-only wiring
- **WHEN** API base URL injection is needed only for verification
- **THEN** the system uses process environment variables or temporary runtime files
- **AND** it does not permanently edit generated application source for that purpose

### Requirement: API smoke and contract checks
The system SHALL run contract and smoke checks before browser-level fullstack verification.

#### Scenario: Contract check runs before browser E2E
- **WHEN** a fullstack application includes `api-contract-check` and `e2e-verify`
- **THEN** API contract compatibility is checked before browser verification
- **AND** contract failures are reported as contract-track failures

#### Scenario: API smoke verifies changed endpoints
- **WHEN** the backend service is started for integration verification
- **THEN** the system runs smoke checks for health, readiness, and changed API endpoints when evidence is available
- **AND** smoke results are written to app-scoped artifacts

### Requirement: Integration artifacts
The system SHALL persist integration startup, smoke, and verification artifacts for each affected application.

#### Scenario: Integration harness writes startup metadata
- **WHEN** the integration harness starts or attempts to start app services
- **THEN** it writes a startup manifest with commands, ports, service URLs, readiness status, environment injection details, and cleanup status

#### Scenario: Integration artifacts are indexed by track and node
- **WHEN** startup, smoke, or E2E artifacts are written
- **THEN** the session workflow instance indexes them under the relevant app, track, and node
- **AND** artifact panels can filter them by selected app, track, and node

