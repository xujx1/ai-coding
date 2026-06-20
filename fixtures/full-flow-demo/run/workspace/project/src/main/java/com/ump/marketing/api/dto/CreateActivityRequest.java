package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

@Data
@EqualsAndHashCode(callSuper = true)
public class CreateActivityRequest extends BaseRequest {
    private String activityName;
    private String toolId;
    private String tenantId;
    private String toolType;
    private BigDecimal thresholdAmount;
    private BigDecimal discountAmount;
    private BigDecimal discountRate;
    private BigDecimal maxDiscount;
    private String couponTemplateId;
    private Boolean isPurchaseLimited;
    private Integer purchaseLimitPerUser;
    private Long startTime;
    private Long endTime;
    private String scopeType;
    private String scopeRefs;
}
