#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MVN="${MAVEN_HOME_BIN:-/Applications/IntelliJ IDEA CE.app/Contents/plugins/maven/lib/maven3/bin/mvn}"
for app in "$ROOT"/ecom-*; do
  echo "== build $(basename "$app")"
  "$MVN" -q -f "$app/pom.xml" test
done
