## Context

The active dynamic workflow changes introduced session execution plans, app branches, nested tracks, E2E verification, and LangGraph migration scaffolding. However, the planner contract is still too permissive: requirement ownership and implementation surfaces can arrive as prose or Markdown tables, and execution planning can fall back to heuristics. That is acceptable as a migration bridge, but it is not a robust Plan-and-Execute architecture.

The target workflow is standard OpenSpec SDD:

- Uploaded MRD and the user's requirement ownership confirmation are the proposal source.
- Generated technical design and spec artifacts are the design/spec source.
- Generated development and test task files become OpenSpec `tasks.md`.
- Dynamic execute nodes are created from validated JSON plan data, not from global fixed templates or regex-parsed text.

## Goals / Non-Goals

**Goals:**

- Define versioned JSON Schemas for planner output, node types, track plans, dependencies, artifacts, confirmations, and replan requests.
- Make structured output the primary planner contract by using provider structured-output support when available and strict schema validation in all runtimes.
- Align generated app OpenSpec artifacts with SDD: `proposal.md` from MRD/confirmation, `design.md` and `spec.md` from technical outputs, `tasks.md` from generated dev/test task files.
- Execute dynamic plans as a DAG with explicit dependencies and resource limits for branches, models, commands, browsers, and tools.
- Support bounded replan of remaining nodes after failure, user feedback, artifact changes, or environment changes.
- Preserve historical runs and active-change compatibility with legacy `prd.md`, fixed Java-only nodes, and existing read models.

**Non-Goals:**

- Do not allow arbitrary model-defined executable node types outside the registered node catalog.
- Do not remove legacy runtime support in the same change.
- Do not build a general workflow editor.
- Do not make regex or keyword matching the primary planning mechanism.

## Decisions

### Decision 1: Node type registry owns JSON Schema

Each executable node type will be registered with:

- `nodeType`
- input JSON Schema
- output JSON Schema
- required artifact contract
- produced artifact contract
- allowed dependencies
- resource requirements
- replan policy
- confirmation policy

The planner may reference only registered node types. The executor validates every node against the registry before scheduling.

Alternatives considered:

- Keep free-form planner output and repair invalid plans with another LLM call. Rejected because invalid dependencies or missing artifacts would surface too late.
- Parse Markdown with regex and ask a model to interpret ambiguous text. Rejected because the core plan would remain untyped and hard to replay.

### Decision 2: Planner structured output is the source of truth

Planner providers should use function calling, JSON mode, or equivalent structured-output APIs to return a `SessionExecutionPlan` document. The runtime validates this document with the versioned schemas and rejects invalid plans before execution.

Limited text parsing remains only for migration:

- reading old `mrd-clarified.md` files without structured surfaces,
- recovering historical sessions,
- producing warnings when legacy artifacts are used.

### Decision 3: Requirement confirmation produces structured surfaces

The requirement ownership confirmation step should output both human-readable review pages and a machine-readable artifact with:

- feature inventory,
- project ownership,
- implementation surfaces (`frontend`, `backend`, `contract`, `e2e`, `documentation`),
- unresolved ownership questions,
- user confirmation decisions.

The planner consumes the structured artifact first. Capability detection is a validator and fallback, not the primary owner of semantic decisions.

### Decision 4: OpenSpec SDD mapping replaces PRD generation

The pipeline will stop treating `prd.md` as a required artifact. App-level OpenSpec generation maps:

- MRD + confirmed ownership -> `proposal.md`
- project technical design -> `design.md`
- project technical design plus interface/test requirements -> `spec.md`
- generated development/test tasks -> `tasks.md`

Legacy `prd.md` remains readable when present, but new runs must not require it.

### Decision 5: DAG executor with resource semaphores

The executor schedules runnable nodes by dependency state, not by a fixed linear chain. Each node declares resource requirements. Scheduler-level semaphores enforce:

- app branch concurrency,
- model call concurrency,
- command/process concurrency,
- browser concurrency,
- tool-specific concurrency where needed.

This avoids overloading model providers, local command execution, or Playwright browsers when fullstack branches run in parallel.

### Decision 6: Replan only remaining work

When execution fails or the user changes a confirmation, the runtime creates a `ReplanRequest` containing completed nodes, failed nodes, remaining nodes, artifacts, and constraints. The replanner can replace only pending or failed subgraphs; completed sibling tracks and accepted artifacts remain locked unless explicitly invalidated.

The runtime enforces a maximum replan count per branch and per session to prevent infinite loops.

## Risks / Trade-offs

- [Risk] Structured-output support differs across providers. -> Mitigation: create a provider adapter that normalizes function calling, JSON mode, and strict JSON validation fallback.
- [Risk] Existing prompts and tests reference `prd.md`. -> Mitigation: migrate reads to `mrd-clarified.md` first and keep `prd.md` as optional legacy input.
- [Risk] Strict schema validation may reject useful but incomplete model output. -> Mitigation: return actionable validation errors to the planner/replanner and retry within a bounded policy.
- [Risk] DAG/replan adds runtime state complexity. -> Mitigation: persist immutable plan revisions and separate plan state from execution state.
- [Risk] UI may show plan internals too early. -> Mitigation: hide dynamic lanes until validated plan creation; show requirement confirmation and validation errors instead.

## Migration Plan

1. Add schema definitions and a node registry without changing execution behavior.
2. Update requirement confirmation to write structured ownership and surface artifacts.
3. Update planner prompt/provider path to request structured output and validate it.
4. Update app OpenSpec generation to use SDD artifact mapping and optional legacy `prd.md` fallback.
5. Replace planner heuristic track selection with structured surfaces plus capability validation.
6. Add DAG scheduler resource semaphores and enforce them in dynamic plan execution.
7. Add replan requests, plan revision persistence, and bounded fuse behavior.
8. Update UI/read model to expose schema validation, plan revision, and replan state.
9. Run default tests, fixture tests, and gated real example flows.

Rollback strategy:

- Keep the current dynamic planner and legacy fixed pipeline behind a feature flag.
- Persist plan schema version and plan revision per session so older runs remain readable.
- Allow fallback to legacy artifact mapping for historical sessions that contain `prd.md`.

## Open Questions

- Which structured-output mode should be the default for each configured provider?
- Should the first implementation use JSON Schema directly or TypeScript/Zod schemas compiled to JSON Schema?
- Should planner schema validation errors be shown in the same confirmation modal or in a dedicated plan validation panel?
- Which resource limits should be configurable globally versus per run?
