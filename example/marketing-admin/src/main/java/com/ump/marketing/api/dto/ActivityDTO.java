package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class ActivityDTO implements Serializable {
    private static final long serialVersionUID = 1L;
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
    private Boolean isPurchaseLimited;
    private Integer purchaseLimitPerUser;
    private String approverId;
    private Long approvalTime;
    private Long onlineTime;
    private String rejectReason;
    private String forceOfflineReason;
    private Integer version;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
