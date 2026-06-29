# Dynamic App Workflow Verification

This note captures the verification approach for
`openspec/changes/plan-and-executor-dynamic-app-workflows`.

## Frontend Interaction Verification

Frontend verification should be split into two nodes:

- `frontend-test`: run the generated frontend project's own checks, such as
  `npm test`, `npm run build`, `npm run lint`, or component tests.
- `e2e-verify`: run browser-level acceptance checks with Playwright.

`frontend-test` verifies that the frontend code can build and pass local tests.
`e2e-verify` verifies that real user flows work in a browser.

Playwright should be owned by the platform runner, not required from every
generated frontend project. If a generated project already contains
`playwright.config.*`, the runner can prefer that project configuration.
Otherwise, the platform should create a temporary E2E harness from MRD/OpenSpec
acceptance scenarios.

The `e2e-verify` runner should capture:

- Playwright report
- screenshots
- traces
- console errors
- network errors
- structured failure classification

Failures should be classified as `frontend`, `backend`, `contract`, or
`environment` so rerun and rollback can target the correct track.

## Frontend and Backend Integration

Generated frontend and backend code should be integrated through a runner-owned
integration harness:

```text
backend-impl
  -> backend-test
frontend-impl
  -> frontend-test
contract
  -> api-contract-check
integration harness
  -> start backend
  -> start frontend with API_BASE_URL
  -> API smoke
  -> Playwright E2E
  -> classify failure
```

The integration flow should:

- validate API contracts before browser verification
- allocate temporary ports per app/session
- start backend services and wait for readiness
- start frontend dev or preview servers
- inject API endpoint environment variables such as `VITE_API_BASE_URL`,
  `NEXT_PUBLIC_API_BASE_URL`, or `REACT_APP_API_BASE_URL`
- run API smoke checks for changed endpoints
- run Playwright browser flows against the live frontend
- write reports and failure classification into app-scoped artifacts

`api-contract-check` should compare frontend expectations with backend
implementation using available signals such as OpenAPI files, controller/router
code, DTO shapes, generated clients, or MRD interface references.

## Startup Policy

`e2e-verify` should automatically start applications only when the capability
detector finds a trusted start command or framework convention. If no reliable
startup path exists, the runner should degrade to build verification,
static/contract checks, and record an explicit unsupported reason instead of
failing the whole branch as a product defect.

Recommended decision for the OpenSpec change:

> `e2e-verify` automatically starts apps when a trusted command exists;
> otherwise it records a verification fallback. Playwright is provided by the
> platform runner, and project-owned Playwright configuration is used when
> present.

