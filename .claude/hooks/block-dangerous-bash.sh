#!/usr/bin/env bash
# PreToolUse guard for Bash. Blocks pushes to the protected branch, force pushes,
# and destructive database operations. Exit 2 blocks the call and shows stderr to
# Claude. Reads the hook payload (JSON) from stdin.
set -euo pipefail

payload="$(cat)"
cmd="$(printf '%s' "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"

block() { echo "BLOCKED by hook: $1" >&2; exit 2; }

# Force push (any branch)
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push.*(--force([^-]|$)|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
  block "force push is not allowed."
fi

# Push to protected branch 'main'
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push.*\bmain\b'; then
  block "pushing to 'main' via this command is not allowed; use the documented workflow."
fi

# Destructive database operations
if printf '%s' "$cmd" | grep -Eiq 'drop[[:space:]]+database|truncate[[:space:]]|supabase[[:space:]]+db[[:space:]]+reset[[:space:]]+--linked|drop[[:space:]]+schema[[:space:]]+public'; then
  block "destructive database operation detected (drop database / truncate / db reset --linked)."
fi

exit 0
