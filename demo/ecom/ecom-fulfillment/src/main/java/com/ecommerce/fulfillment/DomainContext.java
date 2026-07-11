package com.ecommerce.fulfillment;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "fulfillment";
    public static final String DOMAIN_NAME = "履约域";
    public static final String SERVICE_NAME = "Fulfillment Service";
    public static final int PORT = 4216;
    public static final String SUMMARY = "Creates fulfillment orders, splits packages, sources warehouses, dispatches WMS tasks, and syncs delivery status.";
    public static final List<String> CAPABILITIES = List.of("fulfillment-order", "order-split", "warehouse-sourcing", "wms-dispatch", "delivery-status-sync");
    public static final List<String> OWNS = List.of("fulfillment-order", "package", "shipment-plan", "wms-task");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("trade", "inventory", "user");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("logistics", "aftersales");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("履约", "拆单", "寻源", "发货", "签收", "WMS");
    public static final List<String> SAMPLE_ROUTES = List.of("/fulfillments", "/fulfillments/:id/split", "/shipments/:id/status");

    private DomainContext() {
    }
}
