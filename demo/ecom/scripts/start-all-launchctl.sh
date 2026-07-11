#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MVN="${MAVEN_HOME_BIN:-/Applications/IntelliJ IDEA CE.app/Contents/plugins/maven/lib/maven3/bin/mvn}"
LABEL_PREFIX="com.ai-coding.ecom"

mkdir -p "$ROOT/logs" "$ROOT/pids"
rm -f "$ROOT"/pids/*.pid

ENV_ARGS=(
  PRODUCT_DUBBO_URL=dubbo://127.0.0.1:4310
  TRADE_DUBBO_URL=dubbo://127.0.0.1:4311
  PAYMENT_DUBBO_URL=dubbo://127.0.0.1:4312
  AFTERSALES_DUBBO_URL=dubbo://127.0.0.1:4313
  MARKETING_DUBBO_URL=dubbo://127.0.0.1:4314
  INVENTORY_DUBBO_URL=dubbo://127.0.0.1:4315
  FULFILLMENT_DUBBO_URL=dubbo://127.0.0.1:4316
  LOGISTICS_DUBBO_URL=dubbo://127.0.0.1:4317
  USER_DUBBO_URL=dubbo://127.0.0.1:4318
  MERCHANT_DUBBO_URL=dubbo://127.0.0.1:4319
  CONTENT_DUBBO_URL=dubbo://127.0.0.1:4320
  CUSTOMER_SERVICE_DUBBO_URL=dubbo://127.0.0.1:4321
  FINANCE_DUBBO_URL=dubbo://127.0.0.1:4322
  SUPPLY_CHAIN_DUBBO_URL=dubbo://127.0.0.1:4323
)

for app in "$ROOT"/ecom-*; do
  echo "== classpath $(basename "$app")"
  "$MVN" -q -f "$app/pom.xml" -DskipTests package dependency:build-classpath -Dmdep.outputFile="$app/target/classpath.txt"
done

for app in "$ROOT"/ecom-*; do
  name="$(basename "$app")"
  domain="${name#ecom-}"
  class_domain="$(echo "$domain" | tr -d '-')"
  main_class="com.ecommerce.$class_domain.AppServer"
  cp="$app/target/classes:$(cat "$app/target/classpath.txt")"
  label="$LABEL_PREFIX.$name"
  log="$ROOT/logs/$name.log"

  /bin/launchctl remove "$label" >/dev/null 2>&1 || true
  : > "$log"

  echo "== launch $name"
  /bin/launchctl submit -l "$label" -o "$log" -e "$log" -- \
    /usr/bin/env "${ENV_ARGS[@]}" java -Ddubbo.application.qos-enable=false -cp "$cp" "$main_class"
  sleep 1
done

echo "Started services with launchctl. Logs: $ROOT/logs"
