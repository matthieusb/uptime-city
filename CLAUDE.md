# uptime-city

Uptime monitoring tool with the same features as [Gatus](https://github.com/TwiN/gatus): it monitors HTTP services, TCP services (databases, SSH, …), ICMP and DNS. Results are shown in a web app, eventually as an isometric 3D cityscape. For now the UI is a plain 2D view and the city comes later.

There is no authentication of any kind.

The decisions in this file and in the per-part files are the project foundation. Each was researched and approved. Change them only with an explicit decision.

## Architecture & repo layout

The frontend and backend are separate, in one monorepo. Each part has its own `CLAUDE.md` with its specific decisions:

```
backend/        # Python, FastAPI, uv       -> backend/CLAUDE.md (YAML config format, probes, storage; example/config.example.yaml)
frontend/       # Vite + React + TypeScript -> frontend/CLAUDE.md (three.js / R3F, state, tests)
```

- The backend probes the services, stores the results and exposes them.
- The frontend only displays results. It never sends commands to the backend.
- docker-compose comes later.

## Frontend ↔ backend communication

This contract is shared by both parts.

### Transport
- **REST** for the initial snapshot and history.
- **Server-Sent Events (SSE)** for live updates, using FastAPI's built-in `fastapi.sse` (0.135+).
- If SSE keeps failing, the frontend falls back to REST polling.
- No WebSocket. Data flows one way, and SSE reconnects automatically (`Last-Event-ID`) and passes through proxies.
- Gatus itself only polls REST.

### API
```
GET /api/v1/endpoints                → endpoint definitions
GET /api/v1/status                   → snapshot {seq, endpoints:[{id, status, last_check_at, latency_ms, uptime_24h}]}
GET /api/v1/endpoints/{id}/history   → past results (since, limit)
GET /api/v1/hosts/summary            → per physical host {id, services_up, services_down}, vm-hosts' services included
GET /api/v1/buildings/summary        → per host, physical or vm, {id, services_up, services_down} for its own services only
GET /api/v1/events  (text/event-stream)
```

### SSE events
- Types: `check_result`, `status_change`, `config_changed` (the client re-fetches `/endpoints`) and `resync` (the client re-fetches `/status`).
- The event id is a monotonic `seq`. The server keeps recent events in a ring buffer and sends `resync` when a reconnecting client's `Last-Event-ID` is older than that buffer.
- The client loads `/status`, then opens `EventSource` and ignores events whose id is ≤ the snapshot's `seq`.
- SSE payloads are a Pydantic discriminated union on a `type` field.

### Gotchas
- Never put GZip middleware on the SSE route.
- Behind nginx, set `X-Accel-Buffering: no` or `proxy_buffering off`.

### Types
- TypeScript types are generated from `/openapi.json` with `openapi-typescript`.
- CI fails when the generated types drift from the spec.
