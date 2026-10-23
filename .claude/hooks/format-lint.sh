#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): format then lint the modified file.
# Formatting is applied silently. Remaining lint errors are sent back to Claude (exit 2).
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -f "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

case "$f" in
  "$root"/backend/*.py)
    cd "$root/backend" || exit 0
    uv run ruff format "$f" >/dev/null 2>&1
    out=$(uv run ruff check --fix "$f" 2>&1) || { echo "$out" >&2; exit 2; }
    ;;
  "$root"/frontend/*.ts | "$root"/frontend/*.tsx | "$root"/frontend/*.js | "$root"/frontend/*.jsx)
    cd "$root/frontend" || exit 0
    pnpm exec prettier --write "$f" >/dev/null 2>&1
    out=$(pnpm exec oxlint --fix "$f" 2>&1) || { echo "$out" >&2; exit 2; }
    ;;
  "$root"/frontend/*.json | "$root"/frontend/*.css | "$root"/frontend/*.html)
    cd "$root/frontend" || exit 0
    pnpm exec prettier --write "$f" >/dev/null 2>&1
    ;;
esac
exit 0
