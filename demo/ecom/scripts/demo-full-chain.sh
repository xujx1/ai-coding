#!/usr/bin/env bash
set -euo pipefail
curl -sS -X POST http://127.0.0.1:4211/business/demo-full-chain \
  -H 'content-type: application/json' \
  -d '{"orderId":"ORD-FULL-1"}'
echo
