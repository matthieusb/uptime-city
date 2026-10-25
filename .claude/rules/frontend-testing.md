---
paths:
  - "frontend/**"
---

# Frontend testing

Frontend tests are Vitest unit tests (with Testing Library for the 2D UI) in `frontend/tests/unit/`.

Tests are grouped in subfolders of `tests/unit/`: `domain/` (pure monitoring-data logic), `map/` (procedural map generation), `vehicles/` (moving traffic, trains and planes), `effects/` (animation shapes and the state logic that starts and ends them), `view/` (camera, labels and menu-state logic), `components/` (2D panels and menus, with Testing Library) and `app/` (the whole app and hooks).

- Do not write Playwright end-to-end tests or canvas screenshot tests for now.
- Keep the 3D logic testable without the canvas: put layout, status and animation state in pure functions and unit-test those.
- Check the 3D rendering by hand, not with an automated test.
