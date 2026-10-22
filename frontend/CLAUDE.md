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
- Tests: Vitest with Testing Library for logic and the 2D UI. Playwright for end-to-end tests and canvas screenshots.
- TypeScript API types are generated from the backend's `/openapi.json` with `openapi-typescript`.

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
frontend/tests/  unit (vitest)  e2e (playwright)
```
