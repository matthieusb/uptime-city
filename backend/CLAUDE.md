# uptime-city: backend

Python service that probes the configured services, stores the results and exposes them to the frontend. See the root `CLAUDE.md` for the project overview and the REST/SSE contract with the frontend.

## Configuration format (YAML, Gatus-like syntax)

Checks follow Gatus's syntax (see its README) for a subset of its fields, but they are organized under hosts. The generic example config lives in `backend/example/config.example.yaml`; a local copy, `backend/example/config.yaml`, is git-ignored.

- The top of the config can set `lab-name`, the name shown over the 3D map (default `lab-map`, never empty).
- The top layer is made of **physical hosts** (`hosts:`). A physical host has its own check, which can be any supported check, and contains `services` and **vm-hosts** (`vm-hosts:`).
- A **vm-host** has its own check and contains `services` only, never other hosts.
- A service gives its full URL. It never inherits `interval` or `client` settings from its host.
- While a host is down, its services are not probed. They are recorded as down with `host_down: true`.
- There is no Gatus `group` field: the host replaces it.
- An `http(s)://` check, host or service, must have a `[STATUS]` condition, such as `[STATUS] == 200`. Otherwise the config is invalid and the backend does not start.
- A service's id is `<host-id>-<service-id>`, where the host is the physical host or the vm-host it is listed under. Ids must be unique across the config.

```yaml
lab-name: my-lab        # shown over the 3D map; default lab-map
storage:
  type: sqlite            # sqlite (default) | memory | postgres (planned, not supported yet)
  path: data/uptime.db    # postgres (planned): a DSN such as postgres://user:pass@host/db
  retention: 30d          # age-based; replaces Gatus's maximum-number-of-results
hosts:
  - name: gateway                 # physical host
    url: "icmp://10.0.0.1"
    conditions: ["[CONNECTED] == true", "[RESPONSE_TIME] < 50"]
    vm-hosts:
      - name: gateway-vm          # vm-host: services only
        url: "icmp://10.0.0.2"
        services:
          - name: dashboard
            url: "https://dashboard.example.org"
            conditions: ["[STATUS] == 200"]
    services:
      - name: api
        url: "https://api.example.org/health"
        interval: 30s
        client: {timeout: 5s, insecure: false}
        conditions:
          - "[STATUS] == 200"
          - "[BODY].status == UP"
          - "[RESPONSE_TIME] < 500"
          - "[CERTIFICATE_EXPIRATION] > 240h"
      - name: dns
        url: "1.1.1.1"
        dns: {query-name: example.org, query-type: A}
        conditions: ["[DNS_RCODE] == NOERROR"]
  - name: db
    url: "tcp://db:5432"
    conditions: ["[CONNECTED] == true"]
```

### v1
- Check fields (hosts and services): `name`, `url`, `method`, `body`, `headers`, `interval` (default 60s), `enabled`, `client.timeout` (default 30s, for every probe type) and `client.insecure`.
- Schemes: `http(s)://`, `tcp://`, `icmp://`, and DNS. A DNS check has a `dns: {query-name, query-type}` block and uses the resolver as `url`.
- Conditions have the form `"<placeholder> <op> <value>"`.
  - Operators: `== != < <= > >=`.
  - Placeholders: `[STATUS]`, `[RESPONSE_TIME]` (ms), `[CONNECTED]`, `[BODY]`, `[IP]`, `[CERTIFICATE_EXPIRATION]`, `[DNS_RCODE]`.
  - `[BODY]` takes a dotted JSON path and supports `pat()` and `any()`.
- Storage: `sqlite` (default) or `memory`, with `retention` (default 30d); `postgres` is planned, not supported yet.

### v1.1
- Schemes: `ssh://`, `tls://`, `starttls://` and `udp://`.
- Conditions: `len()`, `has()` and `[DOMAIN_EXPIRATION]`.
- The global `concurrency` limit.

### Deferred
- Alerting, external endpoints, suites and maintenance windows.
- Security/OIDC: auth is not wanted at all.
- Badges and Prometheus metrics.
- The ws/grpc/sctp schemes, and oauth2/IAP/proxy/tunnel client options.
- GraphQL.

## Framework
- **FastAPI** on Python 3.13, served by uvicorn.
- Pydantic v2 models validate the YAML config, including durations like `30s` and the parsed conditions. The same models are the API schemas, so the OpenAPI spec comes for free.
- SSE is built into FastAPI.
- Rejected alternatives:
  - Litestar: a smaller ecosystem.
  - Starlette: we'd rebuild what FastAPI adds.
  - aiohttp: no Pydantic or OpenAPI integration.
  - Django: too heavy.
  - Flask: sync-first.

## Scheduling
- Plain asyncio, with no APScheduler.
- Each endpoint has one loop that probes, then sleeps for its `interval`.
- The loops run in an `asyncio.TaskGroup` started from FastAPI's `lifespan`.
- An `asyncio.Semaphore` caps how many probes run at once.

## Probes
All probes are async and share the API's event loop.

| Type | Library |
|---|---|
| HTTP | `httpx` (async), plus `cryptography` for certificate expiry |
| TCP | `asyncio.open_connection` |
| ICMP | `icmplib` (unprivileged) |
| DNS | `dnspython` (`dns.asyncresolver`) |
| SSH (later) | `asyncssh` |

Conditions are parsed and evaluated by our own code, never with `eval()`.

## Storage
- **SQLAlchemy 2.0 Core, async.** Use Core, not the ORM. Pin `sqlalchemy<2.1` until 2.1 is stable.
- Drivers:
  - `sqlite+aiosqlite`: the **default**.
  - `postgresql+asyncpg`: planned, not supported yet.
  - `memory`: SQLite `:memory:` with a `StaticPool`.
- One table definition (`MetaData`) serves both databases. The only dialect-specific code is the upsert helper.
- Migrations: Alembic with `render_as_batch=True` so SQLite can handle `ALTER TABLE`.
- SQLite settings: WAL, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout`, and a single writer.
- Schema:
  - `endpoints (id, key UNIQUE, name, host_id)`
  - `results (endpoint_id, ts, success, status, duration_ms, errors, conditions JSON)`, indexed on `(endpoint_id, ts)`
  - `events (endpoint_id, ts, type)` for UP/DOWN transitions
  - `uptime_hourly (endpoint_id, hour_ts, total, successful, rt_sum_ms)`, PK `(endpoint_id, hour_ts)`
- Each result insert and its `uptime_hourly` upsert happen in the same transaction.
- Retention is 30 days by age. An hourly task prunes rows older than that.
- Uptime % for 24h, 7d and 30d is `SUM(successful)/SUM(total)` over `uptime_hourly`. The 1h figure comes from raw `results`.
- Tests run against SQLite; Postgres (testcontainers) comes with its support.
- Runner-up: raw SQL behind a repository. Rejected because it means two SQL dialects and no Alembic.

## Tooling
- uv, ruff, pyright, pytest, pytest-asyncio, and respx to mock httpx.
- Docker: `python:3.13-slim`, run as non-root. For ICMP, check `net.ipv4.ping_group_range`.

## Layout
```
backend/src/uptime_city/
  app.py                # create_app(), lifespan starts/stops the monitor
  cli.py                # command line (parse_args, run)
  config/               # models/ (Pydantic, one module per type: endpoint, service, vm_host,
                        # physical_host, client, storage, duration, config), loader.py (YAML, durations)
  conditions/           # parser.py, placeholders.py, evaluate.py
  probes/               # base.py (Probe protocol -> ProbeResult), http.py, tcp.py, icmp.py, dns.py
  monitor/              # scheduler.py (per-endpoint loops), simulation.py (fake statuses),
                        # simulation_control.py (start, stop, refresh), events.py (pub/sub for SSE)
  storage/              # base.py (Store protocol), engine.py, schema/ (one module per table), dialect.py,
                        # sql_store.py, maintenance.py (pruning), migrations/ (Alembic)
  api/                  # one router per use case: routes_info.py, routes_city.py,
                        # routes_planet.py,
                        # routes_simulation.py, routes_endpoints.py, routes_health.py, routes_stream.py;
                        # deps.py (monitor and settings store of a request)
backend/tests/
```

## Implemented so far

What exists today, one sentence per feature (see `.claude/rules/document-completed-features.md`). The sections above stay the target.

- **Config**: an optional `lab-name` (default `lab-map`), then YAML physical hosts, each with its own check, its services and its vm-hosts (which have services only), using `icmp://`, `tcp://` and `http(s)://` URLs, without `enabled` or `dns` yet, and each `http(s)://` check needs a `[STATUS]` condition. See `config/models/` and `tests/config/test_endpoint.py`, `tests/config/test_hosts.py` and `tests/config/test_config.py`.
- **Vm-hosts**: the API tells each endpoint's `kind` (physical, vm or service) and a vm-host's `parent_id`; a down physical host does not affect its vm-hosts yet. See `config/models/`, `tests/config/test_endpoint.py`, `tests/config/test_hosts.py` and `tests/config/test_config.py` and `tests/api/test_endpoints.py`.
- **Host down**: a down host's services are recorded as down with `host_down`, without being probed. See `monitor/scheduler.py` and `tests/monitor/test_host_down.py`.
- **HTTP probe**: a check succeeds when every condition passes, and redirects are not followed, so a service that redirects needs a condition like `[STATUS] < 400`. See `probes/http.py` and `tests/probes/test_http.py`.
- **Timeout**: each check gives up after its `client.timeout` (default 30s), HTTP, TCP and ICMP alike. See `config/models/`, `monitor/scheduler.py`, `tests/monitor/test_probing.py` and `tests/probes/test_tcp.py`.
- **TCP probe**: a check succeeds when the connection opens in time. See `probes/tcp.py`, `tests/probes/test_tcp.py` and `tests/config/test_endpoint.py` (URL parsing).
- **ICMP probe**: the default probe for any other scheme. See `probes/icmp.py` and `tests/monitor/test_probing.py`.
- **Conditions**: numeric comparisons on `[STATUS]` and `[RESPONSE_TIME]`, for HTTP only. See `conditions/evaluate.py` and `tests/probes/test_http.py`.
- **Scheduler**: one loop per endpoint, keeping the last 50 results in memory and serving them. See `monitor/scheduler.py` and `tests/monitor/test_probing.py` and `tests/monitor/test_history.py`.
- **Failing probe**: a probe that raises (an invalid URL, a bug) is recorded as a failed check and does not stop the monitor or the other endpoints. See `monitor/scheduler.py` (`_check`), `probes/http.py`, `tests/monitor/test_probing.py` and `tests/probes/test_http.py`.
- **Positive durations**: `interval`, `client.timeout` and `storage.retention` must be greater than zero, else the config is invalid. See `config/models/duration.py` (`Duration`), `tests/config/test_endpoint.py` and `tests/config/test_storage_config.py`.
- **API**: `GET /api/v1/endpoints` (each service carries its `host_id`, each endpoint its `kind` and each vm-host its `parent_id`) and `/endpoints/{id}/history`; no `/status` or `/events` yet. See `api/routes_endpoints.py` and `tests/api/test_endpoints.py`.
- **Simulation**: `--simulate` / `-s` (or `SIMULATION_MODE=true`) probes nothing and fakes consistent statuses (a down host or vm-host takes its services down, 20% of services down, 5% in stand-by shown with `host_down` so the frontend colours them orange), redrawn every 30 seconds once started, and stopped at first (see Simulation start and stop). See `monitor/simulation.py`, `app.py`, `tests/monitor/test_simulation_state.py`, `tests/monitor/test_simulation_control.py` and `tests/app/test_cli.py`.
- **Simulation refresh**: `POST /api/v1/simulation/refresh` redraws the simulated statuses at once and restarts the 30 second countdown, and answers 404 when not simulating. See `monitor/simulation_control.py` (`refresh`), `api/routes_simulation.py` and `tests/api/test_simulation_routes.py`.
- **Simulation start and stop**: `POST /api/v1/simulation/start` and `/stop` start or stop the redrawing every period (stopped at first, a start restarting the countdown, a refresh working in both states), and answer 404 when not simulating. See `monitor/simulation_control.py` (`start`, `stop`, `next_refresh_in_s`), `api/routes_simulation.py`, `tests/monitor/test_simulation_control.py` and `tests/api/test_simulation_routes.py`.
- **Simulation actions**: while the simulation is stopped, `POST /api/v1/simulation/actions/{action}` (with `count` for services) makes an event by hand on the current simulated state, instead of a random redraw: everything up, a random physical host nuked (with its vm-hosts and services), a random vm-host on a host that is up demolished, `count` up services downed, and one host, one vm-host (on a host that is up) or `count` services (not under a down host or vm-host) revived; 409 while running, 404 when not simulating. See `monitor/simulation.py` (`State`, `render`, `Simulation.act`), `monitor/simulation_control.py` (`act`), `api/routes_simulation.py`, `tests/monitor/test_simulation_actions.py` and `tests/api/test_simulation_routes.py`.
- **Info**: `GET /api/v1/info` tells the `lab_name` of the config, whether the backend is in simulation mode, whether it is running (`simulation_running`) and when the next simulated refresh comes (the full period while stopped), for the frontend badges. See `api/routes_info.py` and `tests/api/test_info.py`.
- **City seed**: `GET /api/v1/city` gives the seed the 3D city is drawn from (empty until first regenerated) and `POST /api/v1/city/regenerate` draws and keeps a new one, in a `settings` key/value table that lives in the database picked by the config's `storage` (`sqlite` by default in `data/uptime.db`, or `memory`; `postgres` with a DSN as `path` is planned); tables are created at startup, without Alembic yet. See `storage/` (`engine.py`, `schema.py`, `settings.py`), `config/models/storage.py` (`StorageConfig`), `api/routes_city.py`, `app.py`, `tests/storage/test_settings.py`, `tests/config/test_storage_config.py`, `tests/api/test_city.py` and `tests/app/test_persistence.py`.
- **Result history**: every probe result is saved in a `results` table for the config's `storage.retention` (30 days by default, `d` is a duration unit), the last 50 of each endpoint are reloaded at startup so the bars show the old values, and older ones are deleted at startup and every hour; a failing database is logged and never stops the monitoring, and the simulated statuses are not kept. The older data is not served yet (`/history` stays at 50). Queries run one at a time and to their end even when their caller is cancelled (a write cut short by the monitor's shutdown would lose a whole in-memory database). See `storage/` (`database.py`, `results.py`, `gate.py`, `schema.py`), `monitor/scheduler.py` (`_restore`, `_save`, `_prune_loop`), `config/models/storage.py` (`StorageConfig`), `tests/storage/` (`test_results.py`, `test_gate.py`), `tests/monitor/test_probing.py` and `tests/monitor/test_persistence.py` and `tests/app/test_persistence.py`.
- **Planet seed**: `GET /api/v1/planet` gives the seed the 3D planet is drawn from (empty until first regenerated) and `POST /api/v1/planet/regenerate` draws and keeps a new one, apart from the city seed, in the same `settings` table. See `api/routes_planet.py` and `tests/api/test_planet.py`.
- **Container image**: `backend/Dockerfile` (`python:3.13-slim`, non-root) runs `uptime-city --config /config/config.yaml`; the listen address comes from `--host`/`--port` or `UPTIME_CITY_HOST`/`UPTIME_CITY_PORT`. See `app.py` (`parse_args`) and `tests/app/test_cli.py`.
