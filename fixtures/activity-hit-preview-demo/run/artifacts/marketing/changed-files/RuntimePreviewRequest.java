package com.ump.marketing.api.dto;

import com.ump.marketing.api.enums.ScopeType;

import javax.validation.constraints.NotBlank;

/**
 * Request payload for runtime activity preview queries.
 */
public class RuntimePreviewRequest {

    @NotBlank(message = "requestId is required")
    private String requestId;
    @NotBlank(message = "regionCode is required")
    private String regionCode;
    @NotBlank(message = "operator is required")
    private String operator;
    @NotBlank(message = "scopeType is required")
    private String scopeType;
    @NotBlank(message = "productId is required")
    private String productId;
    private String skuId;

    /**
     * Resolves the effective matched scope type using the SKU-first rule.
     *
     * @return normalized preview scope type
     */
    public ScopeType resolveMatchedScopeType() {
        return ScopeType.normalizePreview(getScopeType(), hasSkuId());
    }

    /**
     * Returns the runtime preview scope type value after applying normalization.
     *
     * @return normalized preview scope type value
     */
    public String resolveEffectiveScopeType() {
        return resolveMatchedScopeType().name();
    }

    /**
     * Indicates whether the request should preview in the SKU dimension.
     *
     * @return true when skuId contains a non-blank value
     */
    public boolean hasSkuId() {
        return trimToNull(skuId) != null;
    }

    /**
     * Validates required preview fields before the service layer executes.
     */
    public void validate() {
        requestId = trimToNull(requestId);
        regionCode = trimToNull(regionCode);
        operator = trimToNull(operator);
        scopeType = trimToNull(scopeType);
        productId = trimToNull(productId);
        skuId = trimToNull(skuId);

        requireField(requestId, "requestId is required");
        requireField(regionCode, "regionCode is required");
        requireField(operator, "operator is required");
        requireField(scopeType, "scopeType is required");
        requireField(productId, "productId is required");
        resolveMatchedScopeType();
    }

    public String getRequestId() {
        return trimToNull(requestId);
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public String getRegionCode() {
        return trimToNull(regionCode);
    }

    public void setRegionCode(String regionCode) {
        this.regionCode = regionCode;
    }

    public String getOperator() {
        return trimToNull(operator);
    }

    public void setOperator(String operator) {
        this.operator = operator;
    }

    public String getScopeType() {
        return trimToNull(scopeType);
    }

    public void setScopeType(String scopeType) {
        this.scopeType = scopeType;
    }

    public String getProductId() {
        return trimToNull(productId);
    }

    public void setProductId(String productId) {
        this.productId = productId;
    }

    public String getSkuId() {
        return trimToNull(skuId);
    }

    public void setSkuId(String skuId) {
        this.skuId = skuId;
    }

    private void requireField(String value, String message) {
        if (trimToNull(value) == null) {
            throw new IllegalArgumentException(message);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
