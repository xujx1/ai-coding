# Source Architecture

The backend source tree is organized around this dependency direction:

```text
server/controller -> service -> workflow -> agent -> tool -> foundation
```

## Layers

- `server/`: HTTP controllers, WebSocket support, and static web entrypoint serving. Controllers parse requests and delegate business behavior.
- `application/`: application management service boundary.
- `knowledge/`: knowledge-base management service boundary.
- `requirements/`: requirement management service boundary.
- `requirement-pi/`: requirement PI / delivery workflow service boundary.
- `app-ops/`: application operations service boundary, including alert analysis and operational failure classification.
- `settings/`: system configuration service boundary.
- `workflows/`: shared workflow engine, definitions, validation, and runtime helpers.
- `lifecycle/`: lifecycle domain kernel for requirement delivery state, artifacts, approvals, deployment, testing, diagnosis, and archive records. Workflows and product services may call lifecycle APIs; lifecycle code stays below product services and above persistence/events/runtime helpers.
- `agents/`: shared agent runtime and agent definitions.
- `tools/`: shared agent-callable tool implementations, registry metadata, and security.
- `models/`, `persistence/`, `events/`, `runtime/`, `config/`, `integrations/`: foundation capabilities.

## Dependency Rules

- Controllers call product services.
- Product services may call workflows and foundation capabilities.
- Product services may read lifecycle state through lifecycle APIs when assembling user-facing views.
- Workflows call agents and persistence/event helpers.
- Workflows may call lifecycle APIs to persist delivery facts and read lifecycle decisions.
- Agents call tools and models.
- Tools call foundation capabilities and external adapters.
- Foundation packages do not import product services or controllers.
- `integrations/` is reserved for external adapters; product behavior belongs in a product service module.

## Automated Guards

- `src/__tests__/architecture-boundaries.test.ts` scans TypeScript imports and fails when foundation, workflow, agent, or tool code imports product services or server controllers.
- Product services are allowed to depend on foundation capabilities, workflows, lifecycle APIs, and other product service public APIs when composing user-facing views.
- Server controllers are the only layer that should translate service results into HTTP status codes, headers, and response bodies.
