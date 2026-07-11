# Trade Service

交易域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_trade_orders?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.trade.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-order`
- `POST /business/get`
- `POST /business/list`
- `POST /business/confirm-paid`
- `POST /business/cancel-order`
- `POST /business/complete-order`

## Domain Boundaries

- Owns: cart, order, order-line, trade-state
- Upstream: product, user, marketing, inventory
- Downstream: payment, fulfillment, aftersales, finance


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.trade.api.TradeDubboService`
- Default URL: `dubbo://127.0.0.1:4311`
- Override port: `DUBBO_PORT=4311`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.

Trade orchestration demo endpoints:

- `POST /business/demo-checkout`
- `POST /business/demo-cancel`
- `POST /business/demo-full-chain`

The trade app uses Dubbo generic references. Override direct URLs with:

- `PRODUCT_DUBBO_URL`
- `USER_DUBBO_URL`
- `MARKETING_DUBBO_URL`
- `INVENTORY_DUBBO_URL`
- `PAYMENT_DUBBO_URL`
- `FULFILLMENT_DUBBO_URL`
- `LOGISTICS_DUBBO_URL`
- `MERCHANT_DUBBO_URL`
- `CONTENT_DUBBO_URL`
- `FINANCE_DUBBO_URL`
- `SUPPLY_CHAIN_DUBBO_URL`
- `AFTERSALES_DUBBO_URL`
- `CUSTOMER_SERVICE_DUBBO_URL`
