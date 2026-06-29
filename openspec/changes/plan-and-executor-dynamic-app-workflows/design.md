## Context

The current dynamic workflow work moved the UI/read model away from a fixed top-level pipeline, but the branch execution shape is still too Java-centric. Real uploaded projects can be backend-only, frontend-only, fullstack, documentation-only, or a mix of multiple modules in one application. A single linear branch chain cannot express an app that needs backend implementation, frontend implementation, API contract checks, and E2E verification, and it cannot cleanly skip frontend nodes for backend-only apps.

The system also has an existing OpenSpec integration: implementation plans, specs, development tasks, test tasks, task completion updates, and archived artifacts are project-scoped and expected by downstream UI and run history. The new planner must preserve that contract rather than replacing it with an unrelated workflow format.

## Goals / Non-Goals

**Goals:**

- Generate a session-scoped execution plan after upload initialization and requirement decomposition.
- Represent each affected application as a branch with nested implementation tracks when needed.
- Detect project capabilities from uploaded files and MRD ownership before planning branch stages.
- Support backend-only, frontend-only, fullstack, documentation-only, and mixed module projects.
- Keep the planner bounded by a catalog of allowed node types and executor contracts.
- Keep OpenSpec generation and task completion compatible with dynamic node plans.
- Render the generated workflow instance in UI and preserve historical run snapshots.

**Non-Goals:**

- Do not allow arbitrary user or LLM-defined executable node types.
- Do not mutate global workflow templates with run-specific app branches or tracks.
- Do not replace OpenSpec with a new task format.
- Do not require every application to have frontend, backend, Java, Maven, or source code.
- Do not implement a general visual workflow editor in this change.

## Decisions

### Decision 1: Use a bounded Plan-and-Executor model

The planner generates a `SessionExecutionPlan` after MRD decomposition and fanout. The executor interprets that plan using a fixed catalog of known node types. Planner output is data, not code.

Allowed top-level shape:

```text
upload-init
  -> mrd-render
  -> project-fanout
  -> app branches
  -> app-join
  -> cross-app-code-review
  -> cross-app-integration-review
  -> archive
```

Allowed application branch shape:

```text
implementation-plan
  -> spec-generate
  -> app-track-fanout
      -> backend track
      -> frontend track
      -> contract track
      -> documentation fallback track
  -> app-track-join
  -> app-branch-summary
```

Alternatives considered:

- Keep a fixed branch chain and hide unsupported stages. Rejected because fullstack apps require parallel backend/frontend/contract work and backend-only apps should not show dead frontend nodes.
- Let an LLM produce free-form workflow nodes. Rejected because it would be hard to validate, test, resume, rerun, and archive safely.

### Decision 2: Separate planning from execution state

Planner output is persisted as part of the session workflow instance, including planner version, source artifacts, project capability snapshot, branch plans, track plans, and validation results. Runtime state is stored separately on branch nodes and track nodes.

This keeps historical sessions reproducible: a later template change does not alter old run layouts.

### Decision 3: Detect capabilities before planning stages

Project capability detection inspects each uploaded app root for signals:

- Backend Java/Maven: `pom.xml`, `src/main/java`, Spring configuration, Maven wrapper.
- Frontend: `package.json`, `vite.config.*`, `next.config.*`, `src/App.*`, `pages/`, `app/`, `public/`, `playwright.config.*`.
- Tests: `src/test`, `__tests__`, `*.test.*`, `pom.xml`, frontend test config.
- Contract/API: OpenAPI files, protobuf/thrift IDL, controller/router files, DTO/request/result naming, MRD cross-app interface references.
- Documentation-only: markdown/design documents without source/build files.

The detector produces confidence, evidence, and fallback reason. The planner uses these capabilities to include or skip tracks.

### Decision 4: Fullstack apps use nested tracks

An app with both frontend and backend capabilities gets an application branch with nested tracks:

```text
app: order-center
  implementation-plan
  spec-generate
  app-track-fanout
    backend: backend-impl -> backend-test
    frontend: frontend-impl -> frontend-test -> e2e-verify
    contract: api-contract-check
  app-track-join
  app-branch-summary
```

Backend-only apps omit frontend nodes. Frontend-only apps omit backend nodes. Documentation-only apps use implementation/test recommendation nodes and produce explicit pseudo-code or landing notes.

### Decision 5: Executor dispatches by node kind and track kind

Executor maps each planned node to a stable runner:

- `implementation-plan`: app-level plan runner.
- `spec-generate`: OpenSpec project/track spec runner.
- `backend-impl` / `java-impl`: backend implementation runner.
- `frontend-impl`: frontend implementation runner.
- `backend-test`: Maven/JUnit or backend test runner.
- `frontend-test`: package-manager test runner.
- `e2e-verify`: Playwright/browser verification runner.
- `api-contract-check`: interface and DTO compatibility runner.
- `documentation-impl` / `documentation-test`: pseudo-code and explicit landing recommendation runners.
- `app-branch-summary`: branch aggregation runner.

The executor validates every plan before running:

- Node type must be in the catalog.
- Track dependencies must be acyclic.
- Required source artifacts must exist.
- Unsupported project capabilities must route to documentation fallback instead of failing silently.

### Decision 6: Preserve OpenSpec as the planning/task contract

OpenSpec remains the task system. The planner/executor maps dynamic branches and tracks to OpenSpec artifacts:

```text
artifacts/<app>/openspec/changes/<change-id>/
  proposal.md
  design.md
  tasks.md
  specs/**/*.md
```

For fullstack apps, `tasks.md` contains track sections:

```markdown
## Backend
- [ ] Add traceKey to DTO
- [ ] Propagate traceKey in service

## Frontend
- [ ] Add traceKey field display/submit behavior
- [ ] Add component tests

## Contract
- [ ] Verify API payload compatibility

## Test
- [ ] Add backend/frontend/E2E coverage
```

Task completion updates must remain project-scoped and track-aware. Archive output must link branch summaries back to OpenSpec change ids and task sections.

### Decision 7: UI renders plan snapshots, not default templates

The frontend reads the session workflow instance. It renders:

- Application fanout.
- One lane per affected app.
- Nested tracks inside an app lane when present.
- Join and cross-app review nodes.
- Artifact panels scoped by selected app, track, and node.

Historical runs continue to render their captured plan or legacy fixed-node layout.

## Risks / Trade-offs

- [Risk] Planner may over-detect frontend/backend capability from unrelated files. -> Mitigation: store evidence and confidence, require allowed fallback to documentation-only or user confirmation when ambiguous.
- [Risk] Nested tracks add UI complexity. -> Mitigation: keep top-level graph coarse and expand app lanes on demand.
- [Risk] OpenSpec tasks can become fragmented across tracks. -> Mitigation: keep one app-level OpenSpec change id with track sections unless an app truly contains independent modules.
- [Risk] Parallel execution can overload model/API/tool limits. -> Mitigation: reuse branch, LLM, command, and browser concurrency semaphores.
- [Risk] Frontend verification may be flaky. -> Mitigation: isolate `frontend-test` from `e2e-verify`, capture screenshots/traces, and classify failures to frontend, backend, contract, or environment.

## Migration Plan

1. Add plan data types for session execution plans, app branch plans, track plans, planner evidence, and validation errors.
2. Add project capability detection and tests for backend-only, frontend-only, fullstack, documentation-only, and mixed project folders.
3. Add a planner that converts fanout decisions and capability snapshots into validated branch/track plans.
4. Extend the executor to dispatch dynamic node kinds through a bounded runner catalog.
5. Extend OpenSpec integration to generate app-level changes with track-aware task sections and completion updates.
6. Update session workflow instance synchronization and artifact indexing for app/track/node selection.
7. Update frontend rendering and artifact filtering for nested app tracks.
8. Add full-flow tests for fullstack apps, backend-only apps, documentation-only apps, and OpenSpec compatibility.

Rollback strategy:

- Keep existing fixed branch chain and legacy rendering as fallback.
- Gate planner execution behind a runtime feature flag until tests pass.
- Persist generated plans per session so disabling the feature does not corrupt historical runs.

## Open Questions

- Should a fullstack app use one OpenSpec change with track sections by default, or one OpenSpec change per track?
- What confidence threshold should require user confirmation before planner execution?
- Should frontend E2E verification start the app automatically, or only run when a project declares a known dev command?
- How should cross-app contract findings route rollback when both frontend and backend tracks are affected?
