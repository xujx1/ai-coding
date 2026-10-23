# Ecom Interfaces

| app | interface | purpose | evidence |
| --- | --- | --- | --- |
| ecom-aftersales | GET http://localhost:4213/health | health check | confirmed |
| ecom-aftersales | GET http://localhost:4213/knowledge | knowledge API | confirmed |
| ecom-aftersales | com.ecommerce.aftersales.api.AftersalesDubboService dubbo://127.0.0.1:4313 | Dubbo provider | confirmed |
| ecom-aftersales | POST /business/create-refund-case | business HTTP API | confirmed |
| ecom-aftersales | POST /business/get | business HTTP API | confirmed |
| ecom-aftersales | POST /business/list | business HTTP API | confirmed |
| ecom-aftersales | POST /business/approve-case | business HTTP API | confirmed |
| ecom-aftersales | POST /business/reject-case | business HTTP API | confirmed |
| ecom-aftersales | POST /business/mark-returned | business HTTP API | confirmed |
| ecom-content | GET http://localhost:4220/health | health check | confirmed |
| ecom-content | GET http://localhost:4220/knowledge | knowledge API | confirmed |
| ecom-content | com.ecommerce.content.api.ContentDubboService dubbo://127.0.0.1:4320 | Dubbo provider | confirmed |
| ecom-content | POST /business/create-post | business HTTP API | confirmed |
| ecom-content | POST /business/get | business HTTP API | confirmed |
| ecom-content | POST /business/list | business HTTP API | confirmed |
| ecom-content | POST /business/bind-product | business HTTP API | confirmed |
| ecom-content | POST /business/approve-content | business HTTP API | confirmed |
| ecom-content | POST /business/reject-content | business HTTP API | confirmed |
| ecom-customer-service | GET http://localhost:4221/health | health check | confirmed |
| ecom-customer-service | GET http://localhost:4221/knowledge | knowledge API | confirmed |
| ecom-customer-service | com.ecommerce.customerservice.api.CustomerServiceDubboService dubbo://127.0.0.1:4321 | Dubbo provider | confirmed |
| ecom-customer-service | POST /business/create-ticket | business HTTP API | confirmed |
| ecom-customer-service | POST /business/get | business HTTP API | confirmed |
| ecom-customer-service | POST /business/list | business HTTP API | confirmed |
| ecom-customer-service | POST /business/assign-ticket | business HTTP API | confirmed |
| ecom-customer-service | POST /business/resolve-ticket | business HTTP API | confirmed |
| ecom-finance | GET http://localhost:4222/health | health check | confirmed |
| ecom-finance | GET http://localhost:4222/knowledge | knowledge API | confirmed |
| ecom-finance | com.ecommerce.finance.api.FinanceDubboService dubbo://127.0.0.1:4322 | Dubbo provider | confirmed |
| ecom-finance | POST /business/record-payment | business HTTP API | confirmed |
| ecom-finance | POST /business/get | business HTTP API | confirmed |
| ecom-finance | POST /business/list | business HTTP API | confirmed |
| ecom-finance | POST /business/create-reconciliation-task | business HTTP API | confirmed |
| ecom-finance | POST /business/create-merchant-settlement | business HTTP API | confirmed |
| ecom-finance | POST /business/create-invoice | business HTTP API | confirmed |
| ecom-fulfillment | GET http://localhost:4216/health | health check | confirmed |
| ecom-fulfillment | GET http://localhost:4216/knowledge | knowledge API | confirmed |
| ecom-fulfillment | com.ecommerce.fulfillment.api.FulfillmentDubboService dubbo://127.0.0.1:4316 | Dubbo provider | confirmed |
| ecom-fulfillment | POST /business/create-fulfillment | business HTTP API | confirmed |
| ecom-fulfillment | POST /business/get | business HTTP API | confirmed |
| ecom-fulfillment | POST /business/list | business HTTP API | confirmed |
| ecom-fulfillment | POST /business/split-package | business HTTP API | confirmed |
| ecom-fulfillment | POST /business/ship-package | business HTTP API | confirmed |
| ecom-fulfillment | POST /business/mark-delivered | business HTTP API | confirmed |
| ecom-inventory | GET http://localhost:4215/health | health check | confirmed |
| ecom-inventory | GET http://localhost:4215/knowledge | knowledge API | confirmed |
| ecom-inventory | com.ecommerce.inventory.api.InventoryDubboService dubbo://127.0.0.1:4315 | Dubbo provider | confirmed |
| ecom-inventory | POST /business/set-stock | business HTTP API | confirmed |
| ecom-inventory | POST /business/get | business HTTP API | confirmed |
| ecom-inventory | POST /business/list | business HTTP API | confirmed |
| ecom-inventory | POST /business/reserve-stock | business HTTP API | confirmed |
| ecom-inventory | POST /business/release-reservation | business HTTP API | confirmed |
| ecom-inventory | POST /business/deduct-reservation | business HTTP API | confirmed |
| ecom-inventory | POST /business/return-stock | business HTTP API | confirmed |
| ecom-logistics | GET http://localhost:4217/health | health check | confirmed |
| ecom-logistics | GET http://localhost:4217/knowledge | knowledge API | confirmed |
| ecom-logistics | com.ecommerce.logistics.api.LogisticsDubboService dubbo://127.0.0.1:4317 | Dubbo provider | confirmed |
| ecom-logistics | POST /business/create-waybill | business HTTP API | confirmed |
| ecom-logistics | POST /business/get | business HTTP API | confirmed |
| ecom-logistics | POST /business/list | business HTTP API | confirmed |
| ecom-logistics | POST /business/mark-picked-up | business HTTP API | confirmed |
| ecom-logistics | POST /business/mark-in-transit | business HTTP API | confirmed |
| ecom-logistics | POST /business/mark-signed | business HTTP API | confirmed |
| ecom-logistics | POST /business/report-exception | business HTTP API | confirmed |
| ecom-marketing | GET http://localhost:4214/health | health check | confirmed |
| ecom-marketing | GET http://localhost:4214/knowledge | knowledge API | confirmed |
| ecom-marketing | com.ecommerce.marketing.api.MarketingDubboService dubbo://127.0.0.1:4314 | Dubbo provider | confirmed |
| ecom-marketing | POST /business/create-campaign | business HTTP API | confirmed |
| ecom-marketing | POST /business/get | business HTTP API | confirmed |
| ecom-marketing | POST /business/list | business HTTP API | confirmed |
| ecom-marketing | POST /business/enable-campaign | business HTTP API | confirmed |
| ecom-marketing | POST /business/disable-campaign | business HTTP API | confirmed |
| ecom-marketing | POST /business/reserve-promotion | business HTTP API | confirmed |
| ecom-marketing | POST /business/confirm-use | business HTTP API | confirmed |
| ecom-marketing | POST /business/cancel-reservation | business HTTP API | confirmed |
| ecom-marketing | POST /business/delete-campaign | business HTTP API | confirmed |
| ecom-merchant | GET http://localhost:4219/health | health check | confirmed |
| ecom-merchant | GET http://localhost:4219/knowledge | knowledge API | confirmed |
| ecom-merchant | com.ecommerce.merchant.api.MerchantDubboService dubbo://127.0.0.1:4319 | Dubbo provider | confirmed |
| ecom-merchant | POST /business/create-merchant | business HTTP API | confirmed |
| ecom-merchant | POST /business/get | business HTTP API | confirmed |
| ecom-merchant | POST /business/list | business HTTP API | confirmed |
| ecom-merchant | POST /business/approve-merchant | business HTTP API | confirmed |
| ecom-merchant | POST /business/disable-shop | business HTTP API | confirmed |
| ecom-payment | GET http://localhost:4212/health | health check | confirmed |
| ecom-payment | GET http://localhost:4212/knowledge | knowledge API | confirmed |
| ecom-payment | com.ecommerce.payment.api.PaymentDubboService dubbo://127.0.0.1:4312 | Dubbo provider | confirmed |
| ecom-payment | POST /business/create-payment | business HTTP API | confirmed |
| ecom-payment | POST /business/get | business HTTP API | confirmed |
| ecom-payment | POST /business/list | business HTTP API | confirmed |
| ecom-payment | POST /business/mark-paid | business HTTP API | confirmed |
| ecom-payment | POST /business/create-refund-payment | business HTTP API | confirmed |
| ecom-product | GET http://localhost:4210/health | health check | confirmed |
| ecom-product | GET http://localhost:4210/knowledge | knowledge API | confirmed |
| ecom-product | com.ecommerce.product.api.ProductDubboService dubbo://127.0.0.1:4310 | Dubbo provider | confirmed |
| ecom-product | POST /business/create-sku | business HTTP API | confirmed |
| ecom-product | POST /business/get | business HTTP API | confirmed |
| ecom-product | POST /business/list | business HTTP API | confirmed |
| ecom-product | POST /business/enable-sale | business HTTP API | confirmed |
| ecom-product | POST /business/disable-sale | business HTTP API | confirmed |
| ecom-supply-chain | GET http://localhost:4223/health | health check | confirmed |
| ecom-supply-chain | GET http://localhost:4223/knowledge | knowledge API | confirmed |
| ecom-supply-chain | com.ecommerce.supplychain.api.SupplyChainDubboService dubbo://127.0.0.1:4323 | Dubbo provider | confirmed |
| ecom-supply-chain | POST /business/create-purchase-order | business HTTP API | confirmed |
| ecom-supply-chain | POST /business/get | business HTTP API | confirmed |
| ecom-supply-chain | POST /business/list | business HTTP API | confirmed |
| ecom-supply-chain | POST /business/approve-quality-check | business HTTP API | confirmed |
| ecom-supply-chain | POST /business/reject-quality-check | business HTTP API | confirmed |
| ecom-supply-chain | POST /business/create-replenishment-plan | business HTTP API | confirmed |
| ecom-trade | GET http://localhost:4211/health | health check | confirmed |
| ecom-trade | GET http://localhost:4211/knowledge | knowledge API | confirmed |
| ecom-trade | com.ecommerce.trade.api.TradeDubboService dubbo://127.0.0.1:4311 | Dubbo provider | confirmed |
| ecom-trade | POST /business/create-order | business HTTP API | confirmed |
| ecom-trade | POST /business/get | business HTTP API | confirmed |
| ecom-trade | POST /business/list | business HTTP API | confirmed |
| ecom-trade | POST /business/confirm-paid | business HTTP API | confirmed |
| ecom-trade | POST /business/cancel-order | business HTTP API | confirmed |
| ecom-trade | POST /business/complete-order | business HTTP API | confirmed |
| ecom-trade | POST /business/demo-checkout | business HTTP API | confirmed |
| ecom-trade | POST /business/demo-cancel | business HTTP API | confirmed |
| ecom-trade | POST /business/demo-full-chain | business HTTP API | confirmed |
| ecom-user | GET http://localhost:4218/health | health check | confirmed |
| ecom-user | GET http://localhost:4218/knowledge | knowledge API | confirmed |
| ecom-user | com.ecommerce.user.api.UserDubboService dubbo://127.0.0.1:4318 | Dubbo provider | confirmed |
| ecom-user | POST /business/create-user | business HTTP API | confirmed |
| ecom-user | POST /business/get | business HTTP API | confirmed |
| ecom-user | POST /business/list | business HTTP API | confirmed |
| ecom-user | POST /business/add-address | business HTTP API | confirmed |
| ecom-user | POST /business/upgrade-member | business HTTP API | confirmed |
