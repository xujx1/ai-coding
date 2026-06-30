package com.ump.marketing.api.enums;

import java.util.Locale;

/**
 * Activity scope types.
 */
public enum ScopeType {
    ALL,
    CATEGORY,
    PRODUCT,
    SKU,
    SKU_LIST;

    /**
     * Normalizes external scope type aliases to the runtime canonical value.
     *
     * @param rawScopeType incoming scope type value
     * @param hasSku whether the request should resolve to the SKU dimension
     * @return canonical scope type
     */
    public static ScopeType normalize(String rawScopeType, boolean hasSku) {
        if (hasSku) {
            return SKU;
        }
        if (rawScopeType == null || rawScopeType.trim().isEmpty()) {
            return PRODUCT;
        }
        String normalized = normalizeToken(rawScopeType);
        if ("SPU".equals(normalized) || "PRODUCT_ID".equals(normalized) || "PRODUCT_LIST".equals(normalized)) {
            return PRODUCT;
        }
        if ("SKU_ID".equals(normalized)) {
            return SKU;
        }
        return ScopeType.valueOf(normalized);
    }

    /**
     * Normalizes preview input to product or SKU while validating supported aliases.
     * SKU always wins when {@code skuId} is present; otherwise preview falls back to product.
     *
     * @param rawScopeType incoming preview scope type value
     * @param hasSku whether the request carries a SKU identifier
     * @return canonical preview scope type
     */
    public static ScopeType normalizePreview(String rawScopeType, boolean hasSku) {
        parsePreviewScopeType(rawScopeType);
        return hasSku ? SKU : PRODUCT;
    }

    private static ScopeType parsePreviewScopeType(String rawScopeType) {
        if (rawScopeType == null || rawScopeType.trim().isEmpty()) {
            throw new IllegalArgumentException("scopeType is required");
        }
        String normalized = normalizeToken(rawScopeType);
        if ("PRODUCT".equals(normalized)
                || "SPU".equals(normalized)
                || "PRODUCT_ID".equals(normalized)
                || "PRODUCT_LIST".equals(normalized)) {
            return PRODUCT;
        }
        if ("SKU".equals(normalized)
                || "SKU_ID".equals(normalized)
                || "SKU_LIST".equals(normalized)) {
            return SKU;
        }
        throw new IllegalArgumentException("scopeType must be PRODUCT or SKU");
    }

    private static String normalizeToken(String rawScopeType) {
        return rawScopeType.trim().toUpperCase(Locale.ROOT).replace('-', '_');
    }
}
