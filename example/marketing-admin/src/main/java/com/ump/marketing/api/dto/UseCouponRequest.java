package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

@Data
@EqualsAndHashCode(callSuper = true)
public class UseCouponRequest extends BaseRequest {
    private static final long serialVersionUID = 1L;
    private String couponInstId;
    private String userId;
    private String orderId;
    private String activityId;
    private BigDecimal usedAmount;
}
