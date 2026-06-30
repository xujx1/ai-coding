package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class CouponBatch {

    private Long id;
    private String batchId;
    private String templateId;
    private String batchName;
    private Integer totalCount;
    private Integer issuedCount = 0;
    private Integer receivedCount = 0;
    private Integer usedCount = 0;
    private String status;
    private Boolean isDeleted = false;
    private Integer version = 0;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
