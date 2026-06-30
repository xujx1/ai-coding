package com.ump.marketing.domain.model;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ScopeActivity {

    private Long id;
    private String scopeKey;
    private String activityId;
    private String toolId;
    private String toolType;
    private String status;
    private BigDecimal thresholdAmount;
    private BigDecimal discountAmount;
    private BigDecimal discountRate;
    private BigDecimal maxDiscount;
    private String couponTemplateId;
    private String regionCode;
    private Long version;
    private String eventId;
    private Long createdAt;
    private Long updatedAt;
}
