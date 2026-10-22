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

## What to stage

- Never commit IDE files (`.idea/`, `.vscode/`) or local data (`data/*.db`).
- Stage files by name and avoid `git add -A`. Before committing, check `git status` for anything unexpected.

## Safety

- Commit only when the user asks, and never push without asking.
- Amending or rewording is fine only for commits that haven't been pushed.
