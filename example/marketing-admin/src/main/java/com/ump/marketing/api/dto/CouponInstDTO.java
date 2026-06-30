package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class CouponInstDTO implements Serializable {
    private static final long serialVersionUID = 1L;
    private String couponInstId;
    private String templateId;
    private String batchId;
    private String userId;
    private String status;
    private String couponType;
    private BigDecimal faceValue;
    private BigDecimal thresholdAmount;
    private String orderId;
    private String activityId;
    private Long validStartTime;
    private Long validEndTime;
    private Long issuedAt;
    private Long receivedAt;
    private Long usedAt;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
}
