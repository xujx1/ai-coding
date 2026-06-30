## Context

The dynamic workflow planning work introduces frontend, backend, contract, documentation, and fullstack tracks, but the verification model still needs concrete browser and integration behavior. The current repository has Node-based build/test scripts and no platform Playwright dependency yet, so E2E verification should be introduced as a platform runner capability instead of assuming every generated project owns its own browser test stack.

Generated fullstack applications need two separate guarantees:

- frontend code can build and pass local checks
- the live frontend can talk to the live backend through real user flows

This design adds those guarantees through `frontend-test`, `api-contract-check`, and `e2e-verify` without making dynamic workflow plans depend on arbitrary LLM-defined executable nodes.

## Goals / Non-Goals

**Goals:**

- Verify generated frontend interactions with Playwright-driven browser flows.
- Keep `frontend-test` separate from browser E2E verification.
- Start generated frontend and backend services in a session-scoped integration harness when trusted startup commands exist.
- Inject API base URLs and allocated ports without permanently mutating generated project source.
- Capture E2E reports, traces, screenshots, console/network diagnostics, startup metadata, and failure classifications as app-scoped artifacts.
- Route failures to `frontend`, `backend`, `contract`, or `environment` so rerun and rollback can target the right track.
- Degrade gracefully when startup cannot be trusted.

**Non-Goals:**

- Do not require every generated frontend project to include Playwright.
- Do not implement a general container orchestration platform.
- Do not make every frontend-only app depend on a backend service.
- Do not replace project-owned tests; `frontend-test` and `backend-test` remain responsible for local test suites.
- Do not treat missing startup metadata as a product defect when build/static/contract checks can still run.

## Decisions

### Decision 1: Platform-owned Playwright runner

`e2e-verify` uses a Playwright runner owned by this platform. If a generated project contains `playwright.config.*`, the runner may execute the project-owned configuration. Otherwise, it generates a temporary E2E harness from MRD/OpenSpec acceptance tasks, route hints, and known UI entry points.

Alternatives considered:

- Require generated projects to include Playwright. Rejected because backend-only and simple frontend projects should not be forced to carry browser test dependencies.
- Use only static DOM/build checks. Rejected because they cannot prove real user interaction or frontend/backend wiring.

### Decision 2: Separate local frontend tests from browser E2E

`frontend-test` runs project-local checks such as build, lint, unit tests, component tests, or project-owned test scripts. `e2e-verify` runs after local checks and is responsible for live browser validation.

This keeps failure classification clear: a TypeScript/build failure belongs to `frontend-test`, while a live interaction or API wiring failure belongs to `e2e-verify` and is further classified.

### Decision 3: Trusted startup detection controls auto-start

The integration harness automatically starts apps only when capability detection finds a trusted startup path, such as known framework scripts, package manager commands, backend launch commands, or explicit project-owned test/dev configuration.

When no trusted startup path exists, `e2e-verify` records a fallback artifact and marks browser verification as unsupported or skipped by policy rather than failing the branch as a product defect.

### Decision 4: Session-scoped integration harness

The integration harness allocates temporary ports per session/app, starts backend services first, waits for readiness, injects the backend URL into frontend environment variables, then starts the frontend dev or preview server.

The harness should support common frontend API URL conventions:

- `VITE_API_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `REACT_APP_API_BASE_URL`
- project-specific configured aliases from capability evidence

Environment injection should be temporary for the verification process. It may use process environment variables or generated temporary env files under runtime artifacts, but it should not permanently rewrite application source just to run verification.

### Decision 5: Contract and smoke checks precede browser E2E

Before Playwright runs, the harness performs API contract and smoke checks. Contract checks compare frontend expectations with backend implementation using OpenAPI files, controller/router code, DTO shapes, generated clients, and MRD interface references when available. Smoke checks verify health/readiness and changed endpoints.

Browser E2E should not be the first signal that the backend cannot start or the contract is impossible to satisfy.

### Decision 6: Structured artifacts and failure classification

`e2e-verify` writes app-scoped artifacts:

- `artifacts/<app>/e2e/startup-manifest.json`
- `artifacts/<app>/e2e/api-smoke-results.json`
- `artifacts/<app>/e2e/playwright-report/`
- `artifacts/<app>/e2e/screenshots/`
- `artifacts/<app>/e2e/traces/`
- `artifacts/<app>/e2e/console-network-summary.json`
- `artifacts/<app>/e2e/failure-classification.json`
- `artifacts/<app>/e2e/verification-summary.md`

Failure classification categories:

- `frontend`: UI rendering, routing, selector, client validation, or browser assertion failure
- `backend`: service startup, readiness, 5xx, persistence, or backend runtime failure
- `contract`: schema mismatch, missing endpoint, incompatible payload, or DTO incompatibility
- `environment`: missing dependency, port conflict, command unavailable, timeout, or sandbox limitation

The executor uses classification to decide rerun targets and to preserve unrelated track artifacts.

## Risks / Trade-offs

- [Risk] Browser verification can be flaky. -> Mitigation: isolate browser concurrency, capture traces/screenshots, use readiness probes, and classify environment failures separately.
- [Risk] Startup command detection may be wrong. -> Mitigation: require evidence, record confidence, and use fallback when confidence is below threshold.
- [Risk] Generated UI may not expose stable selectors. -> Mitigation: generate temporary tests that prefer accessible roles/text and allow selectors to come from project-owned Playwright when present.
- [Risk] Starting fullstack services can consume resources. -> Mitigation: enforce command/browser concurrency limits and terminate all child processes after verification.
- [Risk] Contract inference from code can be incomplete. -> Mitigation: prefer explicit OpenAPI/generated clients, fall back to smoke checks and record unknowns in artifacts.

## Migration Plan

1. Add capability metadata for trusted frontend/backend startup commands, health endpoints, API base URL conventions, and project-owned Playwright config.
2. Add artifact and result types for E2E startup, smoke checks, browser reports, and failure classification.
3. Add platform Playwright dependency and a bounded `e2e-verify` runner.
4. Add an integration harness that starts/stops backend and frontend services with allocated ports and temporary environment injection.
5. Add API smoke and contract check utilities consumed by `api-contract-check` and `e2e-verify`.
6. Wire `e2e-verify` into dynamic app track execution and browser concurrency limits.
7. Surface E2E artifacts in app/track/node artifact panels.
8. Add unit and full-flow tests for successful fullstack verification, startup fallback, contract failure, frontend failure, backend failure, and environment failure.

Rollback strategy:

- Gate `e2e-verify` behind a runtime feature flag.
- Keep `frontend-test` and existing backend tests as independent verification paths.
- If browser verification is disabled, write a skipped/fallback artifact and continue using build, local tests, and contract checks.

## Open Questions

- Which frontend route discovery heuristics should be supported in the first implementation?
- Should browser verification be required for frontend-only apps with no backend, or optional unless MRD acceptance criteria reference user interaction?
- Should Playwright traces be retained for all runs or only failures to control artifact size?

