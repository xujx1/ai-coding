package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

@Data
@EqualsAndHashCode(callSuper = true)
public class UpdateActivityRequest extends BaseRequest {
    private String activityId;
    private String activityName;
    private BigDecimal thresholdAmount;
    private BigDecimal discountAmount;
    private BigDecimal discountRate;
    private BigDecimal maxDiscount;
    private Long startTime;
    private Long endTime;
    private String scopeType;
    private String scopeRefs;
}
