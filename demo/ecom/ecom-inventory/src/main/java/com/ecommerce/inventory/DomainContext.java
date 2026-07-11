package com.ecommerce.inventory;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "inventory";
    public static final String DOMAIN_NAME = "库存域";
    public static final String SERVICE_NAME = "Inventory Service";
    public static final int PORT = 4215;
    public static final String SUMMARY = "Tracks physical stock, available stock, reserved stock, stock release, and multi-warehouse allocation.";
    public static final List<String> CAPABILITIES = List.of("physical-stock", "available-stock", "reserve-stock", "release-stock", "multi-warehouse-stock");
    public static final List<String> OWNS = List.of("stock-item", "stock-reservation", "warehouse-stock", "inventory-ledger");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("product", "trade", "aftersales");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("fulfillment", "supply-chain");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("库存", "实物库存", "可用库存", "预占", "释放", "多仓");
    public static final List<String> SAMPLE_ROUTES = List.of("/stocks/:skuId", "/reservations", "/reservations/:reservationId/release");

    private DomainContext() {
    }
}
