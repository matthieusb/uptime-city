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
uv run uptime-city --config example/config.yaml
```

`--config` is the monitoring config file (default: `config.yaml` in the current directory). `--simulate` (`-s`, or the `SIMULATION_MODE=true` environment variable) probes nothing and fakes statuses instead, with consistent outages (a down host takes its vm-hosts and services down), redrawn every 30 seconds. The API listens on http://127.0.0.1:8000 (health check: `/api/v1/health`, OpenAPI spec: `/openapi.json`, docs: `/docs`). The last 50 results are kept in memory (history is lost on restart).

## Test with your own configuration

`example/config.yaml` is your own local config and is git-ignored. Start from the generic `example/config.example.yaml`:

```sh
cp example/config.example.yaml example/config.yaml
```

Then edit `example/config.yaml`. A config is an optional `lab-name` and a list of physical `hosts`. A physical host has its own check, and contains `services` and `vm-hosts`. A vm-host has its own check and contains `services` only:

```yaml
lab-name: home-lab                          # optional: the name shown over the 3D map (default: lab-map)
hosts:
  - name: web-server                        # a host, shown as a building and a host card
    url: "icmp://web-server.example.org"    # its own check: icmp://, tcp://host:port or http(s)://
    interval: 10s
    services:                               # shown as the floors of the building
      - name: website
        url: "https://www.example.org"      # full URL, nothing is inherited from the host
        interval: 10s
        conditions: ["[STATUS] == 200"]     # required for http(s), e.g. also [RESPONSE_TIME] < 500
    vm-hosts:                               # virtual machines running on this physical host
      - name: web-server-vm                 # a vm-host: its own check, and services only
        url: "icmp://web-server-vm.example.org"
        interval: 10s
        services:
          - name: dashboard
            url: "https://dashboard.example.org"
            interval: 10s
            conditions: ["[STATUS] == 200"]
```

- `lab-name` is the title shown over the 3D map, left of the service counts. It is optional (default `lab-map`) and cannot be empty.
- A host with no `services` is a building with a single floor.
- A vm-host cannot contain other hosts.
- Every `http(s)://` check, host or service, must state its expected status with a `[STATUS]` condition such as `[STATUS] == 200`. Without it the config is invalid and the backend does not start.
- While a host is down its services are not probed, and they are shown as down because of the host.
- Names must be unique: a service id is `<host>-<service>`.
- Restart the backend after each change, since the config is read at startup.

See `CLAUDE.md` for the supported fields and schemes.

## Unit tests

```sh
uv run pytest
```

Useful variants: `uv run pytest -k <name>` to select tests, `uv run pytest -x` to stop at the first failure.
