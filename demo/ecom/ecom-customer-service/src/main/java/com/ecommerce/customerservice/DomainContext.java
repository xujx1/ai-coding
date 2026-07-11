package com.ecommerce.customerservice;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "customer-service";
    public static final String DOMAIN_NAME = "客服域";
    public static final String SERVICE_NAME = "Customer Service";
    public static final int PORT = 4221;
    public static final String SUMMARY = "Handles consultation, work orders, dispute tickets, aftersales support, and bot intent routing.";
    public static final List<String> CAPABILITIES = List.of("consultation", "work-order", "dispute-ticket", "bot-intent", "service-sla");
    public static final List<String> OWNS = List.of("ticket", "conversation", "work-order", "service-sla");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("user", "trade", "aftersales", "logistics");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of();
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("客服", "咨询", "工单", "纠纷", "智能客服", "SLA");
    public static final List<String> SAMPLE_ROUTES = List.of("/tickets", "/conversations", "/bot/intents");

    private DomainContext() {
    }
}
