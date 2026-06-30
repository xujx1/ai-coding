package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import javax.validation.constraints.NotBlank;

/**
 * Request payload for single activity hit preview.
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class PreviewQueryRequest extends BaseRequest {

    @NotBlank(message = "productId is required")
    private String productId;
    private String skuId;
    private String scopeType;

    @Override
    @NotBlank(message = "regionCode is required")
    public String getRegionCode() {
        return super.getRegionCode();
    }

    @Override
    @NotBlank(message = "operator is required")
    public String getOperator() {
        return super.getOperator();
    }

    @Override
    @NotBlank(message = "idempotencyKey is required")
    public String getIdempotencyKey() {
        return super.getIdempotencyKey();
    }
}
