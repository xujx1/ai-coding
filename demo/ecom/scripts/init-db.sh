#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MYSQL="${MYSQL_BIN:-mysql}"
USER_ARG="-u${DB_USER:-root}"
PASS_ARG=""
if [[ -n "${DB_PASSWORD:-}" ]]; then PASS_ARG="-p${DB_PASSWORD}"; fi
"$MYSQL" "$USER_ARG" $PASS_ARG -e "SELECT VERSION();" >/dev/null
for schema in "$ROOT"/ecom-*/src/main/resources/schema.sql; do
  app_dir="$(dirname "$(dirname "$(dirname "$(dirname "$schema")")")")"
  table="$(grep -Eo 'CREATE TABLE IF NOT EXISTS [a-zA-Z0-9_]+' "$schema" | awk '{print $6}')"
  db="ecom_${table}"
  echo "== init $db"
  "$MYSQL" "$USER_ARG" $PASS_ARG -e "CREATE DATABASE IF NOT EXISTS $db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  "$MYSQL" "$USER_ARG" $PASS_ARG "$db" < "$schema"
done
