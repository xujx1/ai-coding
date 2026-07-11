# Merchant Shop Service

店铺商家域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_merchant_shops?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.merchant.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-merchant`
- `POST /business/get`
- `POST /business/list`
- `POST /business/approve-merchant`
- `POST /business/disable-shop`

## Domain Boundaries

- Owns: merchant, shop, qualification, shop-theme
- Upstream: finance
- Downstream: product, content, customer-service


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.merchant.api.MerchantDubboService`
- Default URL: `dubbo://127.0.0.1:4319`
- Override port: `DUBBO_PORT=4319`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
