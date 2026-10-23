# Ecom Domain Context

Ecom is a multi-application ecommerce demo domain. It contains independent Java services plus a Node integration-test repository.

Stage 01 source: static scan of README.md, docs/knowledge.md, schema.sql and Java entrypoint filenames. GitNexus is marked degraded for this smoke run.

| app | responsibility | http | dubbo | owns |
| --- | --- | --- | --- | --- |
| ecom-aftersales | aftersales | HTTP 4213 | Dubbo 4313 | aftersales-order, refund-request, return-package, dispute-case |
| ecom-content | content | HTTP 4220 | Dubbo 4320 | post, video, live-room, comment, creator-profile |
| ecom-customer-service | customer service | HTTP 4221 | Dubbo 4321 | ticket, conversation, work-order, service-sla |
| ecom-finance | finance | HTTP 4222 | Dubbo 4322 | settlement-bill, reconciliation-task, invoice, ledger-entry |
| ecom-fulfillment | fulfillment | HTTP 4216 | Dubbo 4316 | fulfillment-order, package, shipment-plan, wms-task |
| ecom-inventory | inventory | HTTP 4215 | Dubbo 4315 | stock-item, stock-reservation, warehouse-stock, inventory-ledger |
| ecom-logistics | logistics | HTTP 4217 | Dubbo 4317 | waybill, carrier, tracking-event, delivery-exception |
| ecom-marketing | marketing | HTTP 4214 | Dubbo 4314 | campaign, coupon-template, coupon-instance, promotion-rule, points-ledger |
| ecom-merchant | merchant | HTTP 4219 | Dubbo 4319 | merchant, shop, qualification, shop-theme |
| ecom-payment | payment | HTTP 4212 | Dubbo 4312 | payment-order, payment-channel, refund-payment-order |
| ecom-product | product | HTTP 4210 | Dubbo 4310 | spu, sku, category, brand, product-asset |
| ecom-supply-chain | supply chain | HTTP 4223 | Dubbo 4323 | purchase-order, supplier, quality-check, replenishment-plan |
| ecom-trade | trade | HTTP 4211 | Dubbo 4311 | cart, order, order-line, trade-state |
| ecom-user | user | HTTP 4218 | Dubbo 4318 | user-account, member-profile, address, identity-record |
