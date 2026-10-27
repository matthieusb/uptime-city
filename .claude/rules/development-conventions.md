---
paths:
  - "backend/**"
  - "frontend/**"
---

# Development conventions (backend and frontend)

## Separate every technical concern by business unit

Whatever the technical layer (API routes, models, storage, schemas, components, hooks, pure logic, tests, ...), split it by business unit, never keep it as one file or one folder of everything. A business unit is a use case or a domain type of the product: `info`, `city`, `simulation`, `endpoints`, `health`, or in the config an `endpoint`, a `service`, a `vm_host`, a `storage`; in the city `roads`, `seas`, `tracks`, `airport`, `monuments`. Each one gets its own module in the layer, named after it, and a new business unit gets a new module, not more code in an existing one.

- Do not mix two business units in one module, even when each is small. Simulation and city are two units: their routes, models and storage code do not share a file.
- What several units really share goes in a module of its own named for what it is (`deps.py`, `duration.py`, `random.ts`), not copied into each unit and not parked in one of them.
- A module of a unit only imports another unit when it truly builds on it (the simulation routes answer with the `Info` of the info unit).
- A package that is split this way re-exports its public names in its `__init__.py` (backend) when other code uses them as a whole, so that callers do not depend on the inner layout. In the frontend, import from the module of the unit.
- Tests follow the same split: one test module per unit, with what they share in a helpers module next to them.

## Names

- No variable, parameter or attribute uses an abbreviation when the whole word is possible: `result`, not `res`; `endpoint`, not `ep`; `exception`, not `exc`; `vm_host`/`vmHost`, not `vm`; `config` only because it is already the project's word for the configuration. The same goes for loop variables and lambda parameters: `for endpoint in endpoints`, not `for e in endpoints`.
- Short names that are the standard word of their domain are fine: `url`, `id`, `json`, `ms` in a unit suffix such as `latency_ms`, and in the frontend's geometry the coordinates and their maths (`x`, `y`, `z`, `u`, `v`, `dx`, `dz`, `width`-less box corners such as `x0`, `x1`).
- The names a public contract fixes (an API field such as `ts`, a YAML key, a database column) are not renamed: the frontend and the config files depend on them.

## Backend

### Example: API routes

- `backend/src/uptime_city/api/` has one `routes_<unit>.py` per unit: `routes_info.py`, `routes_city.py`, `routes_simulation.py`, `routes_endpoints.py`, `routes_health.py`.
- Each module has its own `router = APIRouter(prefix="/api/v1")` and is added to the `routers` list in `api/__init__.py`, which `app.py` includes. Routes are never declared in `app.py`.
- What routes share (the monitor and the settings store of a request) lives in `api/deps.py`.

### Example: configuration models

- `backend/src/uptime_city/config/models/` has one module per type: `endpoint.py`, `service.py`, `vm_host.py`, `physical_host.py`, `client.py`, `storage.py`, `duration.py`, `config.py`.
- `models/__init__.py` re-exports every public name, so the rest of the code imports from `uptime_city.config.models`, never from a submodule.
- A list default of a model whose base class sits in another module is written `Field(default_factory=list[Item])`, not `= []` (ruff does not recognise the base as Pydantic there, and pyright wants the item type).

### Other layers

- Storage tables: one module per table in `storage/schema/`. The monitor: probing in `scheduler.py`, the simulation in `simulation.py` and its start, stop and refresh in `simulation_control.py`. The entry points: `app.py` builds the app, `cli.py` is the command line.

### API documentation

- Every route is documented. A simple `#` comment above the route is enough.
- A docstring on a route, or on a model field, ends up in `/openapi.json`, and CI fails when the generated frontend types drift from it. Use a `#` comment when the spec should stay as it is, and regenerate the types when it is meant to change.
- Moving or splitting routes must leave the OpenAPI spec identical, route order included.

## Frontend

- The map is split by unit: `world.ts` assembles the map; its roads, seas, seams between biomes, wild tiles and the sizing of the plates each have their own module in `src/city/world/`.
