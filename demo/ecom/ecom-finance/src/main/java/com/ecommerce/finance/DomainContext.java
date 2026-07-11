package com.ecommerce.finance;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "finance";
    public static final String DOMAIN_NAME = "财务结算域";
    public static final String SERVICE_NAME = "Finance Settlement Service";
    public static final int PORT = 4222;
    public static final String SUMMARY = "Owns reconciliation, merchant settlement, revenue share, invoice facts, tax compliance, and ledger events.";
    public static final List<String> CAPABILITIES = List.of("reconciliation", "merchant-settlement", "revenue-share", "invoice", "tax-compliance", "ledger");
    public static final List<String> OWNS = List.of("settlement-bill", "reconciliation-task", "invoice", "ledger-entry");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("payment", "trade", "marketing", "merchant");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("supply-chain");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("财务", "结算", "对账", "分润", "发票", "税务");
    public static final List<String> SAMPLE_ROUTES = List.of("/settlements", "/reconciliation/tasks", "/invoices");

    private DomainContext() {
    }
}
