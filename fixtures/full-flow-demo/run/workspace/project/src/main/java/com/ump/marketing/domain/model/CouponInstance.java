package com.ump.marketing.domain.model;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class CouponInstance {

    private Long id;
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
    private Integer version;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
}
