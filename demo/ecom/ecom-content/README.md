# Content Service

内容域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_content_items?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.content.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-post`
- `POST /business/get`
- `POST /business/list`
- `POST /business/bind-product`
- `POST /business/approve-content`
- `POST /business/reject-content`

## Domain Boundaries

- Owns: post, video, live-room, comment, creator-profile
- Upstream: product, merchant, user
- Downstream: marketing, customer-service


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.content.api.ContentDubboService`
- Default URL: `dubbo://127.0.0.1:4320`
- Override port: `DUBBO_PORT=4320`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
