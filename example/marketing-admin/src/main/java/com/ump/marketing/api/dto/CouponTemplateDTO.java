package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class CouponTemplateDTO implements Serializable {
    private static final long serialVersionUID = 1L;
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
    private Integer version;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
