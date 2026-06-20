package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class OperationAuditLog {

    private Long id;
    private String traceId;
    private String requestId;
    private String operator;
    private String operationType;
    private String aggregateType;
    private String aggregateId;
    private String regionCode;
    private String beforeSnapshot;
    private String afterSnapshot;
    private Long createdAt;
}
