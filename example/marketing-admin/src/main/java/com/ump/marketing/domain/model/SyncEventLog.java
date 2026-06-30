package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class SyncEventLog {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_DLQ = "DLQ";
    public static final String STATUS_MAX_RETRY = "MAX_RETRY";

    private Long id;
    private String eventId;
    private String eventType;
    private String aggregateType;
    private String aggregateId;
    private String regionCode;
    private Long version;
    private String payload;
    private String consumerGroup;
    private String consumeStatus;
    private String errorMessage;
    private Integer retryCount = 0;
    private Long nextRetryAt;
    private Long occurredAt;
    private Long createdAt;
    private Long updatedAt;
}
