# Payment Service

支付域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_payment_orders?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.payment.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-payment`
- `POST /business/get`
- `POST /business/list`
- `POST /business/mark-paid`
- `POST /business/create-refund-payment`

## Domain Boundaries

- Owns: payment-order, payment-channel, refund-payment-order
- Upstream: trade, aftersales
- Downstream: finance


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.payment.api.PaymentDubboService`
- Default URL: `dubbo://127.0.0.1:4312`
- Override port: `DUBBO_PORT=4312`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
