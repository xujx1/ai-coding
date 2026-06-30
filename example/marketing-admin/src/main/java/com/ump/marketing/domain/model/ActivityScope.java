package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class ActivityScope {

    private Long id;
    private String scopeKey;
    private String activityId;
    private String productId;
    private String skuId;
    private String scopeType;
    private String status;
    private Boolean isDeleted = false;
    private Integer version = 0;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
