package com.ecommerce.logistics;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "logistics";
    public static final String DOMAIN_NAME = "物流域";
    public static final String SERVICE_NAME = "Logistics Service";
    public static final int PORT = 4217;
    public static final String SUMMARY = "Integrates carriers, creates waybills, tracks delivery traces, and reports delivery exceptions.";
    public static final List<String> CAPABILITIES = List.of("carrier-integration", "waybill", "tracking", "delivery-exception", "tms-adapter");
    public static final List<String> OWNS = List.of("waybill", "carrier", "tracking-event", "delivery-exception");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("fulfillment");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("customer-service");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("物流", "运单", "轨迹", "配送", "TMS", "物流商");
    public static final List<String> SAMPLE_ROUTES = List.of("/waybills", "/tracks/:waybillNo", "/delivery-exceptions");

    private DomainContext() {
    }
}
