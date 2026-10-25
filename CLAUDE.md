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
- The frontend only displays results. It never sends commands to the backend, with one explicit exception: in simulation mode, the simulation is stopped at first, a click on its counter starts or stops its redrawing (`POST /api/v1/simulation/start` and `/stop`) a button redraws the simulated statuses at once (`POST /api/v1/simulation/refresh`) and, while it is stopped, buttons make by hand the events that would happen by themselves (`POST /api/v1/simulation/actions/{action}`), all of them answering 404 otherwise. The other exception is the toolbox of the 3D view: its regenerate button asks the backend for a new city seed (`POST /api/v1/city/regenerate`), which the backend keeps.
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
GET /api/v1/events  (text/event-stream)
GET /api/v1/city                     → {seed}: what the 3D city layout is drawn from (empty until first regenerated)
POST /api/v1/city/regenerate         → draws a new seed, keeps it in the storage, returns {seed}
POST /api/v1/simulation/refresh      → redraws the simulated statuses now (simulation only)
POST /api/v1/simulation/start|stop   → starts or stops their redrawing every period (simulation only)
POST /api/v1/simulation/actions/{action}[?count=n] → one event by hand: reset, nuke-host, demolish-vm, down-services, revive-host, revive-vm, revive-services (stopped simulation only)
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

## Release

- Manual workflow `.github/workflows/release.yml` (Actions tab, pick patch, minor or major): it tags the latest commit of `main` as `vX.Y.Z` (first release `v0.1.0`), pushes `ghcr.io/<owner>/uptime-city-backend` and `-frontend` images tagged with the version, and creates the GitHub release. The tag and the release are created only after both images are pushed.
