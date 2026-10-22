# uptime-city: frontend

Vite + React + TypeScript web app that displays the monitoring results served by the backend. See `CLAUDE.md` for the design decisions.

## Prerequisites

- Node.js 24+
- [pnpm](https://pnpm.io/)

## Install

```sh
cd frontend
pnpm install
```

## Compile

```sh
pnpm build        # type check (tsc -b) then production build into dist/
pnpm lint         # oxlint
```

## Run

```sh
pnpm dev
```

The app is served on http://localhost:5173. Requests to `/api` are proxied to the backend on http://127.0.0.1:8000, so start the backend first (see `../backend/README.md`).

To serve the production build: `pnpm preview`.

### API types

The TypeScript types are generated from the running backend's OpenAPI spec into `src/api/types.ts`:

```sh
pnpm gen:types
```

## Unit tests

```sh
pnpm test         # Vitest, once (tests in tests/unit)
pnpm exec vitest  # watch mode
```

## End-to-end tests

Playwright tests live in `tests/e2e`. On first use, install the browsers with `pnpm exec playwright install`, then run `pnpm test:e2e`.
