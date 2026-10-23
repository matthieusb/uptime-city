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
