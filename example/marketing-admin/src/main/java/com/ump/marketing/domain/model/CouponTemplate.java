package com.ump.marketing.domain.model;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class CouponTemplate {

    private Long id;
    private String templateId;
    private String templateName;
    private String couponType;
    private BigDecimal faceValue;
    private BigDecimal minAmount;
    private Integer totalCount;
    private Integer remainCount;
    private Integer perUserLimit;
    private Long validStartTime;
    private Long validEndTime;
    private String activityId;
    private String status;
    private Boolean isDeleted = false;
    private Integer version = 0;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
