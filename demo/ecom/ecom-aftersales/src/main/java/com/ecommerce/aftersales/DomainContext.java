package com.ecommerce.aftersales;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "aftersales";
    public static final String DOMAIN_NAME = "售后域";
    public static final String SERVICE_NAME = "Aftersales Service";
    public static final int PORT = 4213;
    public static final String SUMMARY = "Handles refund, return, exchange, aftersales workflow, evidence, and dispute decisions.";
    public static final List<String> CAPABILITIES = List.of("refund", "return", "exchange", "aftersales-workflow", "dispute-evidence");
    public static final List<String> OWNS = List.of("aftersales-order", "refund-request", "return-package", "dispute-case");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("trade", "payment", "fulfillment");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("inventory", "finance", "customer-service");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("售后", "退款", "退货", "换货", "纠纷", "仲裁");
    public static final List<String> SAMPLE_ROUTES = List.of("/aftersales", "/aftersales/:caseId/approve", "/refunds");

    private DomainContext() {
    }
}
