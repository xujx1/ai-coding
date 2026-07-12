# Global GitNexus Graph Summary

> Canonical graph entrypoint for downstream technical design, impact analysis, test case generation, and test data planning. Raw GitNexus indexes are centralized in `global/gitnexus-indexes/`; app knowledge folders only contain lightweight projections.

Apps: 15
Dependency edges: 32

## Consumer Files
- `nodes.json`: app-level graph nodes with GitNexus index stats.
- `edges.json`: cross-app dependency edges.
- `capability-to-code-map.json`: capability to source/component hints.
- `impact-map.json`: upstream/downstream impact lookup by changed app.
- `test-data-map.json`: DB/API/entity hints for integration and E2E test data setup.
- `../gitnexus-indexes/{appId}`: raw GitNexus index snapshots by application.

## GitNexus Indexes
- console: indexed (11 nodes, 15 edges, 0 flows)
- ecom-aftersales: indexed (181 nodes, 420 edges, 20 flows)
- ecom-content: indexed (181 nodes, 420 edges, 20 flows)
- ecom-customer-service: indexed (180 nodes, 416 edges, 20 flows)
- ecom-finance: indexed (181 nodes, 420 edges, 20 flows)
- ecom-fulfillment: indexed (181 nodes, 420 edges, 20 flows)
- ecom-inventory: indexed (181 nodes, 424 edges, 20 flows)
- ecom-logistics: failed (0 nodes, 0 edges, 0 flows)
- ecom-marketing: indexed (185 nodes, 438 edges, 20 flows)
- ecom-merchant: indexed (180 nodes, 416 edges, 20 flows)
- ecom-payment: indexed (180 nodes, 416 edges, 20 flows)
- ecom-product: indexed (180 nodes, 416 edges, 20 flows)
- ecom-supply-chain: indexed (181 nodes, 420 edges, 20 flows)
- ecom-trade: indexed (225 nodes, 555 edges, 20 flows)
- ecom-user: indexed (180 nodes, 416 edges, 20 flows)
