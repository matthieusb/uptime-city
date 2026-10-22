---
name: commit
description: Commit rules for uptime-city. Use whenever creating, amending or rewording a git commit in this repo, or when the user asks to commit changes.
---

# Commit rules

## Message format

Use [Conventional Commits](https://www.conventionalcommits.org/). The subject line is `<type>: <Subject>`.

- Write `<Subject>` in the imperative and start it with a capital letter, e.g. `chore: Add project foundation decisions in CLAUDE.md`.
- Keep the subject short, under ~72 characters, with no trailing period.
- After a blank line, add a body that explains *why* when the change isn't obvious.
- End with the co-author attribution line required by the session.

## Types

| Type | Use for |
|---|---|
| `feat` | A new user-facing feature (probe type, API endpoint, UI view) |
| `fix` | A bug fix |
| `refactor` | A code change that adds no feature and fixes no bug |
| `test` | Adding or updating tests only |
| `docs` | Documentation only (README, docs/) |
| `chore` | Tooling, config, dependencies, project setup, CLAUDE.md |
| `build` / `ci` | Build system, Docker, CI pipelines |

An optional scope is allowed: `feat(backend): ...` or `fix(frontend): ...`.

## Split by part

Never mix `frontend/` and `backend/` changes in one commit. When the working tree touches both, make one commit per part, in separate commits:

1. Group changed files by top-level directory: `backend/` files, `frontend/` files, and everything else (root `config.yaml`, `CLAUDE.md`, `.claude/`, docs).
2. Create one commit per non-empty group, staging only that group's files by name. Use the scope `(backend)` or `(frontend)` for the first two. Root-level files go in their own unscoped commit.
3. Order: `backend` first, then `frontend`, then the rest, unless a part depends on another (e.g. an API contract change), in which case the dependency comes first.
4. If a single file cannot be cleanly attributed to one part (e.g. generated types), put it with the part that produces it, or ask.
5. Each commit gets its own type and subject matching its content; do not reuse one message for all.

## What to stage

- Never commit IDE files (`.idea/`, `.vscode/`) or local data (`data/*.db`).
- Stage files by name and avoid `git add -A`. Before committing, check `git status` for anything unexpected.

## Safety

- Commit only when the user asks, and never push without asking.
- Amending or rewording is fine only for commits that haven't been pushed.
