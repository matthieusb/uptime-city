# uptime-city: frontend

Web app that only displays the monitoring results served by the backend. It never sends commands. See the root `CLAUDE.md` for the project overview and the REST/SSE contract with the backend.

## 3D engine: three.js

- Chosen over Babylon.js for these reasons:
  - Size: about 168 kB gzipped, against about 1.4 MB for Babylon.
  - A mature `WebGPURenderer` that falls back to WebGL2.
  - `OrthographicCamera` for the isometric view, and `InstancedMesh` to draw all buildings in one call.
  - A far bigger ecosystem.
- Babylon is a full game engine we don't need, and its React binding `react-babylonjs` is stale.

## Framework and tooling

- React with React Three Fiber (v9 stable; v10 makes WebGPU the default) and drei (`OrthographicCamera`, `Instances`, `Html`, `Text`).
- Vite and strict TypeScript.
- Live state lives in a **zustand** store fed by the SSE stream. 3D code reads it with `getState()` inside `useFrame`, so updates don't trigger React re-renders.
- **TanStack Query** handles the REST snapshot and history.
- Tests: Vitest with Testing Library for logic and the 2D UI. No Playwright end-to-end tests for now (see `.claude/rules/frontend-testing.md`).
- TypeScript API types are generated from the backend's `/openapi.json` with `openapi-typescript`.

## Map rule

- The ground of the 3D map is one continuous surface: never leave void between plates (neighbourhoods or wilderness). Plates may differ in size, but a row's plates are equally deep and its rows equally wide. When plates need more room, make them bigger (see `src/city/world.ts` and its "no void" test), never move them apart.

## Iterations

1. A 2D `<StatusList>` that reads the store.
2. A lazy-loaded `<CityView>` canvas that reads the **same** store. The 2D view never loads three.js.

The status→visual mapping and the city layout are pure functions, independent of the engine and unit-tested.

Runner-up: SvelteKit + Threlte. Rejected for its smaller community, fewer helpers than drei, and low 2026 activity.

## Layout

```
frontend/src/
  main.tsx  App.tsx              # routes: /list, /city
  api/      client.ts types.ts   # types generated from backend OpenAPI
  data/     store.ts (zustand)  live.ts (SSE -> store, polling fallback)
  domain/   status.ts            # status -> color/animation (pure)
  ui/       StatusList.tsx ServiceCard.tsx Layout.tsx
  city/     (lazy) CityView.tsx Buildings.tsx layout.ts effects/
frontend/tests/  unit (vitest)
```

## Implemented so far

What exists today, one sentence per feature (see `.claude/rules/document-completed-features.md`). The sections above stay the target.

- **Endpoint cards**: one card per endpoint with its average latency, its last 30 checks as green or red bars with tooltips, and the age of its checks. See `src/ui/`, `tests/unit/App.test.tsx` and `tests/unit/checks.test.ts`.
- **Host cards**: endpoints are grouped under their host in a host card (at most 4 per line, each filling its line) whose header shows the host's own status, above one service card per service in ascending alphabetical order (also the 3D floors, first one on top), and a service whose host is down gets a "host down" badge. See `src/ui/HostCard.tsx`, `src/ui/HostHeader.tsx`, `src/domain/hosts.ts`, `tests/unit/hosts.test.ts` and `tests/unit/App.test.tsx`.
- **Tabs**: the 3D city (the default) and the 2D cards are in two tabs, each filling the window, and the city only loads when its tab is open. See `src/ui/TabBar.tsx`, `src/App.tsx`, `tests/unit/TabBar.test.tsx` and `tests/unit/App.test.tsx`.
- **Data**: endpoints and their history are polled over REST with TanStack Query; there is no router, zustand store, SSE or `/status` use yet. See `src/App.tsx` and `src/api/`.
- **3D city**: a lazy-loaded pixel art map on one continuous ground, where each physical host is a neighbourhood with its own biome (coastal, meadow, desert or snow) and unmonitored houses, a supermarket and a car park, linked to the others by roads, and sized to its buildings (a host with fewer services and vms gets a smaller tile) with sparse trees; a neighbourhood holds one building per vm-host and one for the physical host's own check and services, none hiding another, with one named floor per service that breathes green when up and burns when its own service is down, and a building falls into smoking rubble when its host is down, while a neighbourhood whose physical host is down is nuked (scorched ground, a crater, every building in ruins and a slowly billowing mushroom cloud, while the ruins themselves do not fall before our eyes); the map can be dragged and zoomed, and floor names show once zoomed in. See `src/city/` (rules at the top of `layout.ts`, the map in `world.ts`), `src/city/collapse.ts`, `src/city/effects/Nuke.tsx`, `src/domain/status.ts`, `tests/unit/cityLayout.test.ts`, `tests/unit/world.test.ts`, `tests/unit/collapse.test.ts` and `tests/unit/status.test.ts`.
- **Focus view**: a neighbourhood is tinted under the pointer, and a click lifts it in front of the others, with the camera framing it and its host name shown at the top left, until a click anywhere but on it. See `src/city/Plate.tsx`, `src/city/FocusRig.tsx`, `src/city/focus.ts`, `src/index.css` and `tests/unit/focus.test.ts`.
- **Label legend**: a checklist at the top right of the 3D view turns the physical hosts, the services badges and the VM hosts on and off, with only the physical hostnames on at first, only on the whole map (in focus, every label of the tile shows). See `src/city/LabelLegend.tsx`, `src/city/labels.ts` and `tests/unit/LabelLegend.test.tsx`.
- **Theme**: dark, in plain CSS with no framework. See `src/index.css`.
