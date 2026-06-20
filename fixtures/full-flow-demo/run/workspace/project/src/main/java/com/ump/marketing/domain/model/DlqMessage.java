package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class DlqMessage {

    public static final String STATUS_RETRYABLE = "RETRYABLE";
    public static final String STATUS_MAX_RETRY = "MAX_RETRY";
    public static final String STATUS_RESOLVED = "RESOLVED";

    private Long id;
    private String eventId;
    private String topic;
    private String consumerGroup;
    private String payload;
    private String errorMessage;
    private Integer retryCount = 0;
    private Long nextRetryAt;
    private String status;
    private String regionCode;
    private Long createdAt;
    private Long updatedAt;
}
