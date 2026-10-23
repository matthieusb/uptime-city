---
paths:
  - "frontend/**"
---

# Frontend testing

Frontend tests are Vitest unit tests (with Testing Library for the 2D UI) in `frontend/tests/unit/`.

- Do not write Playwright end-to-end tests or canvas screenshot tests for now.
- Keep the 3D logic testable without the canvas: put layout, status and animation state in pure functions and unit-test those.
- Check the 3D rendering by hand, not with an automated test.
