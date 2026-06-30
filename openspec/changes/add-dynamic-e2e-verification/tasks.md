## 1. Capability Metadata and Configuration

- [x] 1.1 Add startup capability metadata for frontend commands, backend commands, readiness endpoints, API base URL conventions, and project-owned Playwright configuration.
- [x] 1.2 Extend project capability detection to record trusted startup evidence, confidence, fallback reasons, and framework/script signals.
- [x] 1.3 Add runtime configuration for enabling `e2e-verify`, browser concurrency, startup timeout, readiness timeout, and artifact retention policy.
- [x] 1.4 Add typed result models for startup manifests, API smoke results, E2E summaries, console/network diagnostics, and failure classification.

## 2. Integration Harness

- [x] 2.1 Implement session/app-scoped port allocation for frontend and backend service startup.
- [x] 2.2 Implement backend service startup with readiness probing, timeout handling, process tracking, and cleanup.
- [x] 2.3 Implement frontend service startup with temporary API base URL environment injection.
- [x] 2.4 Support common frontend API URL conventions including `VITE_API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, and `REACT_APP_API_BASE_URL`.
- [x] 2.5 Write startup manifests with commands, ports, service URLs, readiness status, environment injection details, fallback reasons, and cleanup status.
- [x] 2.6 Ensure all harness-started child processes are terminated on success, failure, cancellation, and timeout.

## 3. Contract and Smoke Checks

- [x] 3.1 Implement API contract check inputs from OpenAPI files, controller/router code, DTO shapes, generated clients, and MRD interface references when available.
- [x] 3.2 Run contract compatibility before browser verification for fullstack plans that include `api-contract-check` and `e2e-verify`.
- [x] 3.3 Implement API smoke checks for health, readiness, and changed endpoints when endpoint evidence exists.
- [x] 3.4 Persist API smoke and contract results as app-scoped artifacts and classify contract failures separately from frontend/backend failures.

## 4. Playwright E2E Runner

- [x] 4.1 Add the platform Playwright dependency and install/runtime setup needed for browser verification.
- [x] 4.2 Implement the bounded `e2e-verify` runner that can execute project-owned `playwright.config.*` when present.
- [x] 4.3 Implement a platform fallback Playwright harness that derives basic browser checks from MRD/OpenSpec acceptance tasks, route hints, and UI evidence.
- [x] 4.4 Ensure `e2e-verify` runs only after required `frontend-test`, startup, and contract/smoke prerequisites are satisfied.
- [x] 4.5 Capture Playwright report output, screenshots, traces, console errors, network errors, and a verification summary.
- [x] 4.6 Implement graceful fallback when no trusted startup path exists and record unsupported or skipped verification reasons without failing the branch as a product defect.

## 5. Execution State, Artifacts, and UI

- [x] 5.1 Wire `e2e-verify` and integration artifacts into dynamic app track execution and browser concurrency controls.
- [x] 5.2 Index startup, smoke, Playwright, screenshot, trace, diagnostics, summary, and failure classification artifacts by app, track, and node.
- [x] 5.3 Add failure classification routing for `frontend`, `backend`, `contract`, and `environment` outcomes.
- [x] 5.4 Preserve completed sibling track artifacts when E2E or integration verification fails.
- [x] 5.5 Surface E2E and integration artifacts in existing app/track/node artifact panels.
- [x] 5.6 Include E2E verification outcomes and fallback reasons in app branch summaries and cross-app integration review inputs.

## 6. Tests and Documentation

- [x] 6.1 Add unit tests for startup capability detection, API base URL convention selection, and unsupported startup fallback.
- [x] 6.2 Add unit tests for port allocation, process cleanup, startup manifest writing, and timeout handling.
- [x] 6.3 Add tests for contract failure, frontend browser failure, backend startup/runtime failure, and environment failure classification.
- [x] 6.4 Add full-flow tests for successful fullstack E2E verification with generated frontend/backend services.
- [x] 6.5 Add full-flow tests confirming browser verification fallback does not fail the branch solely because startup is unsupported.
- [x] 6.6 Update local documentation to describe `frontend-test`, `api-contract-check`, `e2e-verify`, integration artifacts, and fallback behavior.
