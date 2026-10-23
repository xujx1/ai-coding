package com.ecommerce.product;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;

public final class AppServer {
    private static final BusinessService businessService = new BusinessService(new JdbcBusinessRepository());

    private AppServer() {
    }

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", String.valueOf(DomainContext.PORT)));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/health", exchange -> send(exchange, 200, DomainService.health()));
        server.createContext("/knowledge", exchange -> send(exchange, 200, DomainService.knowledge()));
        server.createContext("/sample", exchange -> send(exchange, 200, DomainService.sampleData()));
        server.createContext("/validate-requirement", exchange -> {
            Map<String, Object> input = RequestParser.parseFlatJson(readBody(exchange.getRequestBody()));
            send(exchange, 200, DomainService.validateRequirement(String.valueOf(input.getOrDefault("requirement", ""))));
        });
        server.createContext("/business", AppServer::handleBusiness);
        server.createContext("/", exchange -> send(exchange, 404, Map.of(
                "error", "Not found",
                "routes", List.of("/health", "/knowledge", "/sample", "/validate-requirement", "/business/create-sku", "/business/list", "/business/get")
        )));
        server.start();
        DubboSupport.startProvider(businessService);
        System.out.printf("%s listening on http://localhost:%d%n", DomainContext.SERVICE_NAME, port);
        new CountDownLatch(1).await();
    }

    private static void handleBusiness(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            send(exchange, 204, Map.of());
            return;
        }
        try {
            String path = exchange.getRequestURI().getPath();
            Map<String, Object> input = RequestParser.parseFlatJson(readBody(exchange.getRequestBody()));
            switch (path) {
            case "/business/create-sku" -> send(exchange, 200, businessService.create(input));
            case "/business/list" -> send(exchange, 200, businessService.list());
            case "/business/get" -> send(exchange, 200, businessService.get(String.valueOf(input.getOrDefault("skuId", input.getOrDefault("id", "")))));
            case "/business/enable-sale" -> send(exchange, 200, businessService.enableSale(String.valueOf(input.getOrDefault("skuId", input.getOrDefault("id", "")))));
            case "/business/disable-sale" -> send(exchange, 200, businessService.disableSale(String.valueOf(input.getOrDefault("skuId", input.getOrDefault("id", "")))));
            default -> send(exchange, 404, Map.of("error", "Unknown business route", "path", path));
            }
        } catch (IllegalArgumentException error) {
            send(exchange, 400, Map.of("error", error.getMessage()));
        }
    }

    private static void send(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] payload = JsonSupport.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("content-type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("access-control-allow-origin", "*");
        exchange.getResponseHeaders().set("access-control-allow-methods", "GET,POST,OPTIONS");
        exchange.getResponseHeaders().set("access-control-allow-headers", "content-type");
        exchange.sendResponseHeaders(status, payload.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(payload);
        }
    }

    private static String readBody(InputStream input) throws IOException {
        return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    }
}
