# Global Ecom Knowledge Context

Applications: 15
Dependency edges: 32

> Generated after application knowledge bases were written. Global context only consumes app-level CONTEXT/KB_INDEX/api-index excerpts to keep token usage bounded.

## Applications
- console: console 应用知识库
- ecom-aftersales: Aftersales Service 应用知识库
- ecom-content: Content Service 应用知识库
- ecom-customer-service: Customer Service 应用知识库
- ecom-finance: Finance Settlement Service 应用知识库
- ecom-fulfillment: Fulfillment Service 应用知识库
- ecom-inventory: Inventory Service 应用知识库
- ecom-logistics: Logistics Service 应用知识库
- ecom-marketing: Marketing Service 应用知识库
- ecom-merchant: Merchant Shop Service 应用知识库
- ecom-payment: Payment Service 应用知识库
- ecom-product: Product Service 应用知识库
- ecom-supply-chain: Supply Chain Service 应用知识库
- ecom-trade: Trade Service 应用知识库
- ecom-user: User CRM Service 应用知识库

## Cross-App Dependencies
- ecom-aftersales -> ecom-trade: ecom-aftersales depends on ecom-trade
- ecom-aftersales -> ecom-payment: ecom-aftersales depends on ecom-payment
- ecom-aftersales -> ecom-fulfillment: ecom-aftersales depends on ecom-fulfillment
- ecom-content -> ecom-product: ecom-content depends on ecom-product
- ecom-content -> ecom-merchant: ecom-content depends on ecom-merchant
- ecom-content -> ecom-user: ecom-content depends on ecom-user
- ecom-customer-service -> ecom-user: ecom-customer-service depends on ecom-user
- ecom-customer-service -> ecom-trade: ecom-customer-service depends on ecom-trade
- ecom-customer-service -> ecom-aftersales: ecom-customer-service depends on ecom-aftersales
- ecom-customer-service -> ecom-logistics: ecom-customer-service depends on ecom-logistics
- ecom-finance -> ecom-payment: ecom-finance depends on ecom-payment
- ecom-finance -> ecom-trade: ecom-finance depends on ecom-trade
- ecom-finance -> ecom-marketing: ecom-finance depends on ecom-marketing
- ecom-finance -> ecom-merchant: ecom-finance depends on ecom-merchant
- ecom-fulfillment -> ecom-trade: ecom-fulfillment depends on ecom-trade
- ecom-fulfillment -> ecom-inventory: ecom-fulfillment depends on ecom-inventory
- ecom-fulfillment -> ecom-user: ecom-fulfillment depends on ecom-user
- ecom-inventory -> ecom-product: ecom-inventory depends on ecom-product
- ecom-inventory -> ecom-trade: ecom-inventory depends on ecom-trade
- ecom-inventory -> ecom-aftersales: ecom-inventory depends on ecom-aftersales
- ecom-logistics -> ecom-fulfillment: ecom-logistics depends on ecom-fulfillment
- ecom-marketing -> ecom-product: ecom-marketing depends on ecom-product
- ecom-marketing -> ecom-user: ecom-marketing depends on ecom-user
- ecom-merchant -> ecom-finance: ecom-merchant depends on ecom-finance
- ecom-payment -> ecom-trade: ecom-payment depends on ecom-trade
- ecom-payment -> ecom-aftersales: ecom-payment depends on ecom-aftersales
- ecom-supply-chain -> ecom-inventory: ecom-supply-chain depends on ecom-inventory
- ecom-supply-chain -> ecom-finance: ecom-supply-chain depends on ecom-finance
- ecom-trade -> ecom-product: ecom-trade depends on ecom-product
- ecom-trade -> ecom-user: ecom-trade depends on ecom-user
- ecom-trade -> ecom-marketing: ecom-trade depends on ecom-marketing
- ecom-trade -> ecom-inventory: ecom-trade depends on ecom-inventory

## App Knowledge Inputs
### console

- Knowledge path: apps/console/app-knowledge-base
- Context: console 应用知识库
- Index: 知识库索引
- API: console API Index

### ecom-aftersales

- Knowledge path: apps/ecom-aftersales/app-knowledge-base
- Context: Aftersales Service 应用知识库
- Index: 知识库索引
- API: Aftersales Service API Index

### ecom-content

- Knowledge path: apps/ecom-content/app-knowledge-base
- Context: Content Service 应用知识库
- Index: 知识库索引
- API: Content Service API Index

### ecom-customer-service

- Knowledge path: apps/ecom-customer-service/app-knowledge-base
- Context: Customer Service 应用知识库
- Index: 知识库索引
- API: Customer Service API Index

### ecom-finance

- Knowledge path: apps/ecom-finance/app-knowledge-base
- Context: Finance Settlement Service 应用知识库
- Index: 知识库索引
- API: Finance Settlement Service API Index

### ecom-fulfillment

- Knowledge path: apps/ecom-fulfillment/app-knowledge-base
- Context: Fulfillment Service 应用知识库
- Index: 知识库索引
- API: Fulfillment Service API Index

### ecom-inventory

- Knowledge path: apps/ecom-inventory/app-knowledge-base
- Context: Inventory Service 应用知识库
- Index: 知识库索引
- API: Inventory Service API Index

### ecom-logistics

- Knowledge path: apps/ecom-logistics/app-knowledge-base
- Context: Logistics Service 应用知识库
- Index: 知识库索引
- API: Logistics Service API Index

### ecom-marketing

- Knowledge path: apps/ecom-marketing/app-knowledge-base
- Context: Marketing Service 应用知识库
- Index: 知识库索引
- API: Marketing Service API Index

### ecom-merchant

- Knowledge path: apps/ecom-merchant/app-knowledge-base
- Context: Merchant Shop Service 应用知识库
- Index: 知识库索引
- API: Merchant Shop Service API Index

### ecom-payment

- Knowledge path: apps/ecom-payment/app-knowledge-base
- Context: Payment Service 应用知识库
- Index: 知识库索引
- API: Payment Service API Index

### ecom-product

- Knowledge path: apps/ecom-product/app-knowledge-base
- Context: Product Service 应用知识库
- Index: 知识库索引
- API: Product Service API Index

### ecom-supply-chain

- Knowledge path: apps/ecom-supply-chain/app-knowledge-base
- Context: Supply Chain Service 应用知识库
- Index: 知识库索引
- API: Supply Chain Service API Index

### ecom-trade

- Knowledge path: apps/ecom-trade/app-knowledge-base
- Context: Trade Service 应用知识库
- Index: 知识库索引
- API: Trade Service API Index

### ecom-user

- Knowledge path: apps/ecom-user/app-knowledge-base
- Context: User CRM Service 应用知识库
- Index: 知识库索引
- API: User CRM Service API Index

