# Development

How to work on uptime-city. The design decisions live in `CLAUDE.md` (root, `backend/` and `frontend/`).

## Setup

Each part has its own prerequisites and commands:

- Backend (Python, uv): see `backend/README.md`.
- Frontend (Node 24, pnpm): see `frontend/README.md`.

## Checks

CI runs these on every push (`.github/workflows/backend.yml` and `frontend.yml`). Run them before opening a pull request.

```sh
# backend/
uv run ruff format --check && uv run ruff check && uv run pyright && uv run pytest

# frontend/
pnpm exec prettier --check . && pnpm lint && pnpm build && pnpm test
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>: <Subject>`, with the subject in the imperative and capitalised, e.g. `fix(backend): Handle a missing config file`. Do not mix `backend/` and `frontend/` changes in one commit.

## Docker images

Each part has a `Dockerfile`:

```sh
docker build -t uptime-city-backend backend
docker build -t uptime-city-frontend frontend
```

The backend reads its config from `/config/config.yaml` and listens on port 8000. The frontend serves the app on port 8080 and proxies `/api/` to `BACKEND_URL` (default `http://backend:8000`), so both containers must share a network where the backend is reachable under that name.

## Release process

**Only a maintainer can release**, that is, someone with write access to the repository. Contributors do not tag, release or publish images.

Releases are made by the manual `Release` workflow (`.github/workflows/release.yml`), never by hand-pushing tags.

1. Merge everything to release into `main` and wait for its checks to pass. The workflow refuses to release a commit whose checks failed.
2. Open the repository's **Actions** tab, pick **Release**, click **Run workflow** on the `main` branch and choose the bump:
   - `patch`: bug fixes (`1.2.3` → `1.2.4`).
   - `minor`: backwards-compatible features (`1.2.3` → `1.3.0`).
   - `major`: breaking changes (`1.2.3` → `2.0.0`).
3. The workflow then:
   - computes the next [SemVer](https://semver.org/) version from the latest `vX.Y.Z` tag (the first release is `v0.1.0`, or `v1.0.0` with `major`);
   - builds and pushes `ghcr.io/matthieusb/uptime-city-backend` and `ghcr.io/matthieusb/uptime-city-frontend`, tagged `X.Y.Z`, `X.Y` and `latest` (and `X` once past `0.x`);
   - creates the tag `vX.Y.Z` on the latest commit of `main` and the GitHub release of the same name, with generated notes.

The tag and the release are created only after both images are pushed, so a failed run leaves no tag: fix the cause and run it again.

The repository needs Actions workflow permissions set to "Read and write" (Settings → Actions → General). New GHCR packages are private until their visibility is changed in the package settings.
