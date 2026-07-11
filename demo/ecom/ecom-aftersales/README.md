# Aftersales Service

售后域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_aftersales_cases?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.aftersales.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-refund-case`
- `POST /business/get`
- `POST /business/list`
- `POST /business/approve-case`
- `POST /business/reject-case`
- `POST /business/mark-returned`

## Domain Boundaries

- Owns: aftersales-order, refund-request, return-package, dispute-case
- Upstream: trade, payment, fulfillment
- Downstream: inventory, finance, customer-service


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.aftersales.api.AftersalesDubboService`
- Default URL: `dubbo://127.0.0.1:4313`
- Override port: `DUBBO_PORT=4313`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
