# uptime-city: backend

Python service that probes the configured services, stores the results and exposes them to the frontend. See the root `CLAUDE.md` for the project overview and the REST/SSE contract with the frontend.

## Configuration format (YAML, Gatus-like syntax)

Checks follow Gatus's syntax (see its README) for a subset of its fields, but they are organized under hosts. The generic example config lives in `backend/example/config.example.yaml`; a local copy, `backend/example/config.yaml`, is git-ignored.

- The top layer is made of **physical hosts** (`hosts:`). A physical host has its own check, which can be any supported check, and contains `services` and **vm-hosts** (`vm-hosts:`).
- A **vm-host** has its own check and contains `services` only, never other hosts.
- A service gives its full URL. It never inherits `interval` or `client` settings from its host.
- While a host is down, its services are not probed. They are recorded as down with `host_down: true`.
- There is no Gatus `group` field: the host replaces it.
- An `http(s)://` check, host or service, must have a `[STATUS]` condition, such as `[STATUS] == 200`. Otherwise the config is invalid and the backend does not start.
- A service's id is `<host-id>-<service-id>`, where the host is the physical host or the vm-host it is listed under. Ids must be unique across the config.

```yaml
storage:
  type: sqlite            # sqlite (default) | postgres | memory
  path: data/uptime.db    # or a postgres DSN: postgres://user:pass@host/db
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
- Check fields (hosts and services): `name`, `url`, `method`, `body`, `headers`, `interval` (default 60s), `enabled`, `client.timeout` (default 10s) and `client.insecure`.
- Schemes: `http(s)://`, `tcp://`, `icmp://`, and DNS. A DNS check has a `dns: {query-name, query-type}` block and uses the resolver as `url`.
- Conditions have the form `"<placeholder> <op> <value>"`.
  - Operators: `== != < <= > >=`.
  - Placeholders: `[STATUS]`, `[RESPONSE_TIME]` (ms), `[CONNECTED]`, `[BODY]`, `[IP]`, `[CERTIFICATE_EXPIRATION]`, `[DNS_RCODE]`.
  - `[BODY]` takes a dotted JSON path and supports `pat()` and `any()`.
- Storage: `sqlite` (default), `postgres` or `memory`, with `retention` (default 30d).

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
  - `postgresql+asyncpg`: supported.
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
- Tests run against both SQLite and Postgres (testcontainers).
- Runner-up: raw SQL behind a repository. Rejected because it means two SQL dialects and no Alembic.

## Tooling
- uv, ruff, pyright, pytest, pytest-asyncio, and respx to mock httpx.
- Docker: `python:3.13-slim`, run as non-root. For ICMP, check `net.ipv4.ping_group_range`.

## Layout
```
backend/src/uptime_city/
  main.py               # create_app(), lifespan starts/stops the monitor
  config/               # models.py (Pydantic), loader.py (YAML, durations)
  conditions/           # parser.py, placeholders.py, evaluate.py
  probes/               # base.py (Probe protocol -> ProbeResult), http.py, tcp.py, icmp.py, dns.py
  monitor/              # scheduler.py (per-endpoint loops), events.py (pub/sub for SSE)
  storage/              # base.py (Store protocol), engine.py, schema.py, dialect.py,
                        # sql_store.py, maintenance.py (pruning), migrations/ (Alembic)
  api/                  # routes_endpoints.py, routes_stream.py, schemas.py
backend/tests/
```

## Implemented so far

What exists today, one sentence per feature (see `.claude/rules/document-completed-features.md`). The sections above stay the target.

- **Config**: YAML physical hosts, each with its own check, its services and its vm-hosts (which have services only), using `icmp://`, `tcp://` and `http(s)://` URLs, without `enabled` or `dns` yet, and each `http(s)://` check needs a `[STATUS]` condition. See `config/models.py` and `tests/test_config.py`.
- **Vm-hosts**: the API tells each endpoint's `kind` (physical, vm or service) and a vm-host's `parent_id`; a down physical host does not affect its vm-hosts yet. See `config/models.py`, `tests/test_config.py` and `tests/test_main.py`.
- **Host down**: a down host's services are recorded as down with `host_down`, without being probed. See `monitor/scheduler.py` and `tests/test_monitor.py`.
- **HTTP probe**: a check succeeds when every condition passes, and redirects are not followed, so a service that redirects needs a condition like `[STATUS] < 400`. See `probes/http.py` and `tests/test_http_probe.py`.
- **TCP probe**: a check succeeds when the connection opens in time. See `probes/tcp.py` and `tests/test_tcp_probe.py`.
- **ICMP probe**: the default probe for any other scheme. See `probes/icmp.py` and `tests/test_monitor.py`.
- **Conditions**: numeric comparisons on `[STATUS]` and `[RESPONSE_TIME]`, for HTTP only. See `conditions/evaluate.py` and `tests/test_http_probe.py`.
- **Scheduler**: one loop per endpoint, keeping the last 50 results in memory (no storage yet). See `monitor/scheduler.py` and `tests/test_monitor.py`.
- **API**: `GET /api/v1/endpoints` (each service carries its `host_id`, each endpoint its `kind` and each vm-host its `parent_id`) and `/endpoints/{id}/history`; no `/status` or `/events` yet. See `api/routes_endpoints.py` and `tests/test_main.py`.
- **Host summaries**: `GET /api/v1/hosts/summary` gives, for each physical host, how many of its services, and of those on its vm-hosts, are up and down as of their last result. `GET /api/v1/buildings/summary` gives the same for each host's own services only. See `monitor/scheduler.py` (`service_counts`, `building_counts`), `api/routes_endpoints.py`, `tests/test_monitor.py` and `tests/test_main.py`.
