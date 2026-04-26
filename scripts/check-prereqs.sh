#!/usr/bin/env bash
set -euo pipefail

ok() { printf "  ✓ %s\n" "$1"; }
ko() { printf "  ✗ %s\n" "$1"; FAIL=1; }

FAIL=0

echo "Checking prompt-eval prerequisites..."

command -v claude >/dev/null && ok "claude CLI present" || ko "claude CLI missing"
command -v bun    >/dev/null && ok "bun present"        || ko "bun missing"
command -v gh     >/dev/null && ok "gh CLI present"     || ko "gh missing (optional for purely-local profiles)"
command -v git    >/dev/null && ok "git present"        || ko "git missing"
command -v patch  >/dev/null && ok "patch present"      || ko "patch missing"

if [ -n "${MISTRAL_API_KEY:-}" ]; then
  ok "MISTRAL_API_KEY set"
else
  ko "MISTRAL_API_KEY not set"
fi

# Check Claude Code Agent Teams flag in user settings (best effort).
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ] && grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$SETTINGS"; then
  ok "Agent Teams flag found in $SETTINGS"
else
  echo "  ! Could not confirm CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in $SETTINGS — please verify manually."
fi

exit "$FAIL"
