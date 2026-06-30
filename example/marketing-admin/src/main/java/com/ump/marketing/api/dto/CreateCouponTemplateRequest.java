package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

@Data
@EqualsAndHashCode(callSuper = true)
public class CreateCouponTemplateRequest extends BaseRequest {
    private static final long serialVersionUID = 1L;
    private String templateName;
    private String couponType;
    private BigDecimal faceValue;
    private BigDecimal minAmount;
    private Integer totalCount;
    private Integer perUserLimit;
    private Long validStartTime;
    private Long validEndTime;
    private String activityId;
}
