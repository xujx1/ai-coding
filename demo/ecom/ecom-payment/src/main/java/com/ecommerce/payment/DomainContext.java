package com.ecommerce.payment;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "payment";
    public static final String DOMAIN_NAME = "支付域";
    public static final String SERVICE_NAME = "Payment Service";
    public static final int PORT = 4212;
    public static final String SUMMARY = "Provides payment order, cashier, channel callback, refund payment, and reconciliation facts.";
    public static final List<String> CAPABILITIES = List.of("payment-order", "cashier", "channel-callback", "refund-payment", "payment-reconciliation");
    public static final List<String> OWNS = List.of("payment-order", "payment-channel", "refund-payment-order");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("trade", "aftersales");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("finance");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("支付", "收银台", "支付单", "回调", "退款支付", "支付渠道");
    public static final List<String> SAMPLE_ROUTES = List.of("/payments", "/payments/:paymentId/callbacks", "/refund-payments");

    private DomainContext() {
    }
}
