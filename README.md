# uptime-city

Uptime city is an uptime monitoring tool focused on visualization through a cityscape like picture

## Run locally

Copy the example config and adapt it to your own hosts (see `backend/README.md`), start the backend, then the frontend:

```sh
cp backend/example/config.example.yaml backend/example/config.yaml
cd backend && uv run uptime-city --config example/config.yaml
cd frontend && pnpm dev   # http://localhost:5173
```

See `backend/README.md` and `frontend/README.md` for details.

## Self host

Release images are published to the GitHub container registry: `ghcr.io/matthieusb/uptime-city-backend` and `ghcr.io/matthieusb/uptime-city-frontend`. Replace `latest` with a version such as `0.1.0` to pin it, and use the same version for both. Both need a monitoring config: start from `backend/example/config.example.yaml` and save your copy as `config.yaml` (see `backend/README.md`).

The frontend serves the app on port 8080 and proxies `/api/` to the backend, which listens on port 8000 inside the Docker network. Only the frontend needs to be published.

### docker-compose

```sh
cp docker-compose.example.yml docker-compose.yml
cp backend/example/config.example.yaml config.yaml   # then edit it with your hosts
docker compose up -d                                  # http://localhost:8080
```

`docker-compose.example.yml` mounts `config.yaml` read-only, keeps the SQLite history in the `uptime-data` volume and sets `net.ipv4.ping_group_range` so that `icmp://` checks work without root. Uncomment `SIMULATION_MODE` to try the app with fake statuses.

### docker run

Create a network so the frontend can reach the backend by name, then start both containers:

```sh
docker network create uptime-city

docker run -d --name backend --network uptime-city --restart unless-stopped \
  --sysctl net.ipv4.ping_group_range="0 2147483647" \
  -v "$PWD/config.yaml:/config/config.yaml:ro" \
  -v uptime-data:/app/data \
  ghcr.io/matthieusb/uptime-city-backend:latest

docker run -d --name frontend --network uptime-city --restart unless-stopped \
  -e BACKEND_URL=http://backend:8000 \
  -p 8080:8080 \
  ghcr.io/matthieusb/uptime-city-frontend:latest
```

Open http://localhost:8080. The containers are named `backend` and `frontend`; if you rename the backend, set `BACKEND_URL` accordingly. Add `-e SIMULATION_MODE=true` to the backend to fake the statuses instead of probing anything. The `--sysctl` flag is only needed for `icmp://` checks.

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for the checks to run, the commit conventions, the Docker images and the release process (reserved to maintainers).
