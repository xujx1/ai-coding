package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class IdempotencyRecord {

    public static final String STATUS_PROCESSING = "PROCESSING";
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_FAILED = "FAILED";

    private Long id;
    private String idempotencyKey;
    private String requestHash;
    private String responseJson;
    private String status;
    private String regionCode;
    private Long createdAt;
    private Long expiredAt;
}
