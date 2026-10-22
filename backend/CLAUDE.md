# uptime-city: backend

Python service that probes the configured services, stores the results and exposes them to the frontend. See the root `CLAUDE.md` for the project overview and the REST/SSE contract with the frontend.

## Configuration format (YAML, Gatus syntax)

We follow Gatus's syntax (see its README) and support a subset of it. The example config lives in `config.yaml` at the repo root.

```yaml
storage:
  type: sqlite            # sqlite (default) | postgres | memory
  path: data/uptime.db    # or a postgres DSN: postgres://user:pass@host/db
  retention: 30d          # age-based; replaces Gatus's maximum-number-of-results
endpoints:
  - name: api
    group: core
    url: "https://api.example.org/health"
    interval: 30s
    client: {timeout: 5s, insecure: false}
    conditions:
      - "[STATUS] == 200"
      - "[BODY].status == UP"
      - "[RESPONSE_TIME] < 500"
      - "[CERTIFICATE_EXPIRATION] > 240h"
  - name: postgres
    group: db
    url: "tcp://db:5432"
    conditions: ["[CONNECTED] == true"]
  - name: gateway
    url: "icmp://10.0.0.1"
    conditions: ["[CONNECTED] == true", "[RESPONSE_TIME] < 50"]
  - name: dns
    url: "1.1.1.1"
    dns: {query-name: example.org, query-type: A}
    conditions: ["[DNS_RCODE] == NOERROR"]
```

### v1
- Endpoint fields: `name`, `group`, `url`, `method`, `body`, `headers`, `interval` (default 60s), `enabled`, `client.timeout` (default 10s) and `client.insecure`.
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
  - `endpoints (id, key UNIQUE, name, group)`
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
