# Supply Chain Service

供应链域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_supply_chain_purchase_orders?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.supplychain.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-purchase-order`
- `POST /business/get`
- `POST /business/list`
- `POST /business/approve-quality-check`
- `POST /business/reject-quality-check`
- `POST /business/create-replenishment-plan`

## Domain Boundaries

- Owns: purchase-order, supplier, quality-check, replenishment-plan
- Upstream: inventory, finance
- Downstream: inventory, merchant


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.supplychain.api.SupplyChainDubboService`
- Default URL: `dubbo://127.0.0.1:4323`
- Override port: `DUBBO_PORT=4323`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
