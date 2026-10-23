# Ecom App Map

| app | owns | upstream | downstream |
| --- | --- | --- | --- |
| ecom-aftersales | aftersales-order, refund-request, return-package, dispute-case | trade, payment, fulfillment | inventory, finance, customer-service |
| ecom-content | post, video, live-room, comment, creator-profile | product, merchant, user | marketing, customer-service |
| ecom-customer-service | ticket, conversation, work-order, service-sla | user, trade, aftersales, logistics | none |
| ecom-finance | settlement-bill, reconciliation-task, invoice, ledger-entry | payment, trade, marketing, merchant | supply-chain |
| ecom-fulfillment | fulfillment-order, package, shipment-plan, wms-task | trade, inventory, user | logistics, aftersales |
| ecom-inventory | stock-item, stock-reservation, warehouse-stock, inventory-ledger | product, trade, aftersales | fulfillment, supply-chain |
| ecom-logistics | waybill, carrier, tracking-event, delivery-exception | fulfillment | customer-service |
| ecom-marketing | campaign, coupon-template, coupon-instance, promotion-rule, points-ledger | product, user | trade, finance |
| ecom-merchant | merchant, shop, qualification, shop-theme | finance | product, content, customer-service |
| ecom-payment | payment-order, payment-channel, refund-payment-order | trade, aftersales | finance |
| ecom-product | spu, sku, category, brand, product-asset | none | search, trade, marketing, inventory |
| ecom-supply-chain | purchase-order, supplier, quality-check, replenishment-plan | inventory, finance | inventory, merchant |
| ecom-trade | cart, order, order-line, trade-state | product, user, marketing, inventory | payment, fulfillment, aftersales, finance |
| ecom-user | user-account, member-profile, address, identity-record | none | trade, marketing, fulfillment, customer-service |
