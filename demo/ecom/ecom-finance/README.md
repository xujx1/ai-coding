# Finance Settlement Service

财务结算域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_finance_settlements?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.finance.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/record-payment`
- `POST /business/get`
- `POST /business/list`
- `POST /business/create-reconciliation-task`
- `POST /business/create-merchant-settlement`
- `POST /business/create-invoice`

## Domain Boundaries

- Owns: settlement-bill, reconciliation-task, invoice, ledger-entry
- Upstream: payment, trade, marketing, merchant
- Downstream: supply-chain


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.finance.api.FinanceDubboService`
- Default URL: `dubbo://127.0.0.1:4322`
- Override port: `DUBBO_PORT=4322`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
