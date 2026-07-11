#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL_PREFIX="com.ai-coding.ecom"
for app in "$ROOT"/ecom-*; do
  label="$LABEL_PREFIX.$(basename "$app")"
  /bin/launchctl remove "$label" >/dev/null 2>&1 || true
done
if compgen -G "$ROOT/pids/*.pid" > /dev/null; then
  for pidfile in "$ROOT"/pids/*.pid; do
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" || true
    fi
    rm -f "$pidfile"
  done
fi
echo "Stopped ecom demo services."
