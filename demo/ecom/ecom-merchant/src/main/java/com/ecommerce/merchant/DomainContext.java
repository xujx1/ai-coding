package com.ecommerce.merchant;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "merchant";
    public static final String DOMAIN_NAME = "店铺商家域";
    public static final String SERVICE_NAME = "Merchant Shop Service";
    public static final int PORT = 4219;
    public static final String SUMMARY = "Supports merchant onboarding, qualification audit, shop profile, shop decoration, and merchant console facts.";
    public static final List<String> CAPABILITIES = List.of("merchant-onboarding", "qualification-audit", "shop-profile", "shop-decoration", "merchant-console");
    public static final List<String> OWNS = List.of("merchant", "shop", "qualification", "shop-theme");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of("finance");
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("product", "content", "customer-service");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("商家", "店铺", "入驻", "资质", "审核", "店铺装修");
    public static final List<String> SAMPLE_ROUTES = List.of("/merchants", "/merchants/:merchantId/audits", "/shops/:shopId");

    private DomainContext() {
    }
}
