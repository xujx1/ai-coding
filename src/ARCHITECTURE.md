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
- `agents/`: shared agent runtime and agent definitions.
- `tools/`: shared agent-callable tool implementations, registry metadata, and security.
- `models/`, `persistence/`, `events/`, `runtime/`, `config/`, `integrations/`: foundation capabilities.

## Dependency Rules

- Controllers call product services.
- Product services may call workflows and foundation capabilities.
- Workflows call agents and persistence/event helpers.
- Agents call tools and models.
- Tools call foundation capabilities and external adapters.
- Foundation packages do not import product services or controllers.
- `integrations/` is reserved for external adapters; product behavior belongs in a product service module.
