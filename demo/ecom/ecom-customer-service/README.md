# Customer Service

客服域 Java service for ecommerce cross-domain knowledge, requirement validation, and basic business capability verification.

## Database

This service is backed by MySQL through JDBC.

Default connection:

- `DB_URL=jdbc:mysql://localhost:3306/ecom_customer_service_tickets?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`
- `DB_USER=root`
- `DB_PASSWORD=`

Create the database first, then apply `src/main/resources/schema.sql`.

## Run

```bash
mvn test
mvn package
java -cp target/classes:~/.m2/repository/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar com.ecommerce.customerservice.AppServer
```

## Knowledge APIs

- `GET /health`
- `GET /knowledge`
- `GET /sample`
- `POST /validate-requirement`

## Business APIs

- `POST /business/create-ticket`
- `POST /business/get`
- `POST /business/list`
- `POST /business/assign-ticket`
- `POST /business/resolve-ticket`

## Domain Boundaries

- Owns: ticket, conversation, work-order, service-sla
- Upstream: user, trade, aftersales, logistics
- Downstream: none


## Dubbo

This app exports a Dubbo provider using direct URL mode.

- Interface: `com.ecommerce.customerservice.api.CustomerServiceDubboService`
- Default URL: `dubbo://127.0.0.1:4321`
- Override port: `DUBBO_PORT=4321`

Start MySQL first, create the app database, apply `src/main/resources/schema.sql`, then start the app.
