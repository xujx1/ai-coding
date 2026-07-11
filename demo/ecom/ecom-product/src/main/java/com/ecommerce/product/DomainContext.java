package com.ecommerce.product;

import java.util.List;

public final class DomainContext {
    public static final String DOMAIN = "product";
    public static final String DOMAIN_NAME = "商品域";
    public static final String SERVICE_NAME = "Product Service";
    public static final int PORT = 4210;
    public static final String SUMMARY = "Manages SPU, SKU, category attributes, brand data, product media, and base price facts.";
    public static final List<String> CAPABILITIES = List.of("spu-management", "sku-management", "category-attributes", "brand-catalog", "product-media", "base-price-facts");
    public static final List<String> OWNS = List.of("spu", "sku", "category", "brand", "product-asset");
    public static final List<String> UPSTREAM_DEPENDENCIES = List.of();
    public static final List<String> DOWNSTREAM_CONSUMERS = List.of("search", "trade", "marketing", "inventory");
    public static final List<String> REQUIREMENT_KEYWORDS = List.of("商品", "SPU", "SKU", "类目", "属性", "品牌", "素材", "价格");
    public static final List<String> SAMPLE_ROUTES = List.of("/products", "/products/:spuId/skus", "/categories/:categoryId/attributes");

    private DomainContext() {
    }
}
