#!/usr/bin/env bash
# PostToolUse hook for Edit|Write. When a TypeScript source file changes, lint it and
# typecheck the project. Exit 2 surfaces failures back to Claude. During the planning
# phase (no package.json yet) it exits 0 silently. Reads the hook payload from stdin.
set -uo pipefail

payload="$(cat)"
file="$(printf '%s' "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

# Only act on TypeScript/TSX source files.
case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Project not scaffolded yet — nothing to check.
[ -f package.json ] || exit 0

fail=0
if ! pnpm lint --file "$file" >/tmp/hook-lint.log 2>&1; then
  echo "Lint failed for $file:" >&2; cat /tmp/hook-lint.log >&2; fail=1
fi
if ! pnpm typecheck >/tmp/hook-tsc.log 2>&1; then
  echo "Typecheck failed:" >&2; cat /tmp/hook-tsc.log >&2; fail=1
fi

[ "$fail" -eq 0 ] && exit 0 || exit 2
