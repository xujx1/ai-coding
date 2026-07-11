# Inventory Service

库存域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_inventory_stocks?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.inventory.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/set-stock`
- `POST /business/get`
- `POST /business/list`
- `POST /business/reserve-stock`
- `POST /business/release-reservation`
- `POST /business/deduct-reservation`
- `POST /business/return-stock`

## Domain Boundaries

- Owns: stock-item, stock-reservation, warehouse-stock, inventory-ledger
- Upstream: product, trade, aftersales
- Downstream: fulfillment, supply-chain


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.inventory.api.InventoryDubboService`
- Default URL: `dubbo://127.0.0.1:4315`
- Override port: `DUBBO_PORT=4315`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
