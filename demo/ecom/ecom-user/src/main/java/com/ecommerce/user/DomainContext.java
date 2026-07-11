package com.ecommerce.user;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "user";
    public static final String DOMAIN_NAME = "用户域";
    public static final String SERVICE_NAME = "User CRM Service";
    public static final int PORT = 4218;
    public static final String SUMMARY = "Owns account, authentication profile, membership level, user tags, identity verification, and address book.";
    public static final List<String> CAPABILITIES = List.of("account", "member-level", "user-profile", "identity-verification", "address-book", "user-tags");
    public static final List<String> OWNS = List.of("user-account", "member-profile", "address", "identity-record");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of();
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("trade", "marketing", "fulfillment", "customer-service");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("用户", "会员", "账号", "地址", "实名", "画像", "等级");
    public static final List<String> SAMPLE_ROUTES = List.of("/users/:userId", "/users/:userId/addresses", "/members/:userId/level");

    private DomainContext() {
    }
}
