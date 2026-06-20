package com.ump.marketing.domain.model;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class Activity {

    private Long id;
    private String activityId;
    private String tenantId;
    private String activityName;
    private String toolId;
    private String toolType;
    private BigDecimal thresholdAmount;
    private BigDecimal discountAmount;
    private BigDecimal discountRate;
    private BigDecimal maxDiscount;
    private String couponTemplateId;
    private String status;
    private Long startTime;
    private Long endTime;
    private String scopeType;
    private String scopeRefs;
    private Boolean isPurchaseLimited = false;
    private Integer purchaseLimitPerUser;
    private String approvalStatus = "NONE";
    private String approverId;
    private Long approvalTime;
    private Long onlineTime;
    private String rejectReason;
    private String forceOfflineReason;
    private Boolean isDeleted = false;
    private Integer version = 0;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
