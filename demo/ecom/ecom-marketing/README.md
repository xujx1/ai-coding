# Marketing Service

营销域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_marketing_campaigns?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.marketing.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-campaign`
- `POST /business/get`
- `POST /business/list`
- `POST /business/enable-campaign`
- `POST /business/disable-campaign`
- `POST /business/reserve-promotion`
- `POST /business/confirm-use`
- `POST /business/cancel-reservation`
- `POST /business/delete-campaign`

## Domain Boundaries

- Owns: campaign, coupon-template, coupon-instance, promotion-rule, points-ledger
- Upstream: product, user
- Downstream: trade, finance


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.marketing.api.MarketingDubboService`
- Default URL: `dubbo://127.0.0.1:4314`
- Override port: `DUBBO_PORT=4314`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
