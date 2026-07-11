package com.ecommerce.supplychain;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "supply-chain";
    public static final String DOMAIN_NAME = "供应链域";
    public static final String SERVICE_NAME = "Supply Chain Service";
    public static final int PORT = 4223;
    public static final String SUMMARY = "Coordinates procurement, suppliers, replenishment, quality inspection, production planning, and SRM facts.";
    public static final List<String> CAPABILITIES = List.of("procurement", "supplier", "replenishment", "quality-inspection", "production-plan", "srm");
    public static final List<String> OWNS = List.of("purchase-order", "supplier", "quality-check", "replenishment-plan");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("inventory", "finance");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("inventory", "merchant");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("供应链", "采购", "供应商", "SRM", "质检", "补货", "生产计划");
    public static final List<String> SAMPLE_ROUTES = List.of("/purchase-orders", "/suppliers", "/replenishment/plans");

    private DomainContext() {
    }
}
