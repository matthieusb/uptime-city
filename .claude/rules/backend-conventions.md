---
paths:
  - "backend/**"
---

# Backend development conventions

## Separate every technical concern by business unit

Whatever the technical layer (API routes, models, storage, schemas, tests, ...), split it by business unit, never keep it as one file or one folder of everything. A business unit is a use case or a domain type of the product: `info`, `city`, `simulation`, `endpoints`, `health`, or in the config an `endpoint`, a `service`, a `vm_host`, a `storage`. Each one gets its own module in the layer, named after it, and a new business unit gets a new module, not more code in an existing one.

- Do not mix two business units in one module, even when each is small. Simulation and city are two units: their routes, models and storage code do not share a file.
- What several units really share goes in a module of its own named for what it is (`deps.py`, `duration.py`), not copied into each unit and not parked in one of them.
- A module of a unit only imports another unit when it truly builds on it (the simulation routes answer with the `Info` of the info unit).
- A package that is split this way re-exports its public names in its `__init__.py` when other code uses them as a whole, so that callers do not depend on the inner layout.

### Example: API routes

- `backend/src/uptime_city/api/` has one `routes_<unit>.py` per unit: `routes_info.py`, `routes_city.py`, `routes_simulation.py`, `routes_endpoints.py`, `routes_health.py`.
- Each module has its own `router = APIRouter(prefix="/api/v1")` and is added to the `routers` list in `api/__init__.py`, which `main.py` includes. Routes are never declared in `main.py`.
- What routes share (the monitor and the settings store of a request) lives in `api/deps.py`.

### Example: configuration models

- `backend/src/uptime_city/config/models/` has one module per type: `endpoint.py`, `service.py`, `vm_host.py`, `physical_host.py`, `client.py`, `storage.py`, `duration.py`, `config.py`.
- `models/__init__.py` re-exports every public name, so the rest of the code imports from `uptime_city.config.models`, never from a submodule.
- A list default of a model whose base class sits in another module is written `Field(default_factory=list[Item])`, not `= []` (ruff does not recognise the base as Pydantic there, and pyright wants the item type).

## API documentation

- Every route is documented. A simple `#` comment above the route is enough.
- A docstring on a route, or on a model field, ends up in `/openapi.json`, and CI fails when the generated frontend types drift from it. Use a `#` comment when the spec should stay as it is, and regenerate the types when it is meant to change.
- Moving or splitting routes must leave the OpenAPI spec identical, route order included.
