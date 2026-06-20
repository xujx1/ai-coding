package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class ScopeActivityDTO implements Serializable {
    private static final long serialVersionUID = 1L;
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
    private Long version;
    private String eventId;
    private String regionCode;
}
