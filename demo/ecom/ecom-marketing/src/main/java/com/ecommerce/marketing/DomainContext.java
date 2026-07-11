package com.ecommerce.marketing;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "marketing";
    public static final String DOMAIN_NAME = "营销域";
    public static final String SERVICE_NAME = "Marketing Service";
    public static final int PORT = 4214;
    public static final String SUMMARY = "Manages campaigns, coupons, discount rules, flash sale, group-buy, points, and eligibility checks.";
    public static final List<String> CAPABILITIES = List.of("campaign", "coupon", "discount-rule", "flash-sale", "group-buy", "points", "eligibility-check");
    public static final List<String> OWNS = List.of("campaign", "coupon-template", "coupon-instance", "promotion-rule", "points-ledger");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("product", "user");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("trade", "finance");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("营销", "优惠券", "满减", "秒杀", "拼团", "积分", "活动");
    public static final List<String> SAMPLE_ROUTES = List.of("/campaigns", "/coupons/claim", "/promotions/preview");

    private DomainContext() {
    }
}
