## Why

Dynamic application workflows can now represent frontend, backend, contract, and fullstack tracks, but generated frontend interactions and frontend/backend integration still need an executable verification contract. Without a dedicated E2E and integration harness, fullstack runs can produce code that builds in isolation while failing in real browser/API flows.

## What Changes

- Add platform-owned frontend E2E verification for dynamic app workflows using Playwright when an app has a trusted startup path or project-owned Playwright configuration.
- Split frontend verification into `frontend-test` for project-local checks and `e2e-verify` for browser-level acceptance flows.
- Add a runner-owned integration harness that starts generated backend and frontend services with session-scoped ports and environment injection.
- Add API smoke and contract checks before browser verification so failures can be routed to frontend, backend, contract, or environment tracks.
- Persist E2E reports, screenshots, traces, network/console errors, startup metadata, and structured failure classifications as app-scoped artifacts.
- Degrade verification gracefully when no trusted startup command exists by recording an explicit fallback reason instead of treating the run as a product defect.

## Capabilities

### New Capabilities

- `dynamic-e2e-verification`: Defines browser-level verification for generated frontend and fullstack application tracks, including Playwright execution, artifact capture, fallback behavior, and failure classification.
- `generated-app-integration-harness`: Defines how generated frontend and backend services are started, wired together, smoke-tested, and verified inside a session-scoped integration environment.

### Modified Capabilities

- None.

## Impact

- Affects dynamic branch execution, frontend track runners, browser concurrency, app artifact indexing, retry/rerun routing, and cross-app integration review inputs.
- Adds a Playwright-backed platform verification runner and service startup orchestration for generated app projects.
- May add project capability detection signals for trusted frontend/backend startup commands, health/readiness endpoints, and API base URL environment variable conventions.
- Produces new artifacts under each app branch for E2E reports, screenshots, traces, startup manifests, smoke results, and failure classification.

