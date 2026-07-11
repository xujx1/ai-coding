# Product Service

商品域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_product_skus?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.product.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-sku`
- `POST /business/get`
- `POST /business/list`
- `POST /business/enable-sale`
- `POST /business/disable-sale`

## Domain Boundaries

- Owns: spu, sku, category, brand, product-asset
- Upstream: none
- Downstream: search, trade, marketing, inventory


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.product.api.ProductDubboService`
- Default URL: `dubbo://127.0.0.1:4310`
- Override port: `DUBBO_PORT=4310`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
