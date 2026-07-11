package com.ecommerce.trade;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "trade";
    public static final String DOMAIN_NAME = "交易域";
    public static final String SERVICE_NAME = "Trade Service";
    public static final int PORT = 4211;
    public static final String SUMMARY = "Owns cart, order creation, order state machine, order cancellation, and trade orchestration.";
    public static final List<String> CAPABILITIES = List.of("cart", "order-create", "order-state-machine", "order-cancel", "trade-orchestration");
    public static final List<String> OWNS = List.of("cart", "order", "order-line", "trade-state");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("product", "user", "marketing", "inventory");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("payment", "fulfillment", "aftersales", "finance");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("购物车", "下单", "订单", "订单状态", "取消订单", "交易");
    public static final List<String> SAMPLE_ROUTES = List.of("/carts/:userId", "/orders", "/orders/:orderId/state");

    private DomainContext() {
    }
}
