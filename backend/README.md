# uptime-city: backend

Python service (FastAPI, Python 3.13) that probes the configured services, stores the results and exposes them over REST and SSE. See `CLAUDE.md` for the design decisions.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (it installs Python 3.13 if needed)

## Install / build

```sh
cd backend
uv sync
```

This creates `.venv/` and installs the project with its dev dependencies. There is no separate compilation step; to check the code statically:

```sh
uv run ruff check .      # lint
uv run ruff format .     # format
uv run pyright           # type check (strict)
```

## Run

```sh
uv run uptime-city
```

The API listens on http://127.0.0.1:8000 (health check: `/api/v1/health`, OpenAPI spec: `/openapi.json`, docs: `/docs`).

For auto-reload during development:

```sh
uv run fastapi dev src/uptime_city/main.py
```

## Unit tests

```sh
uv run pytest
```

Useful variants: `uv run pytest -k <name>` to select tests, `uv run pytest -x` to stop at the first failure.
