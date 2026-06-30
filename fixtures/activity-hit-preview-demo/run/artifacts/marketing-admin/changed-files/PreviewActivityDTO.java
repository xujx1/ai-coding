package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * Activity projection used by preview responses.
 */
@Data
public class PreviewActivityDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String activityId;
    private String activityName;
    private String status;
    private String toolType;
    private BigDecimal thresholdAmount;
    private BigDecimal discountAmount;
    private BigDecimal discountRate;
    private BigDecimal maxDiscount;
    private String couponTemplateId;
    private String regionCode;
    private String productId;
    private String skuId;
    private String scopeType;
    private String sourceSide;
}
