package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class ActivityTool {

    private Long id;
    private String toolId;
    private String tenantId;
    private String toolName;
    private String toolType;
    private String toolDescription;
    private String exclusionRules;
    private Integer priority;
    private String status;
    private Boolean isDeleted = false;
    private Integer version = 0;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
