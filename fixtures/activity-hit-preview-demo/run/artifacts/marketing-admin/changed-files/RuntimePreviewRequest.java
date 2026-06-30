package com.ump.marketing.infrastructure.client.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * Downstream runtime preview request payload.
 */
@Data
public class RuntimePreviewRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    private String requestId;
    private String caller;
    private String operator;
    private String regionCode;
    private String idempotencyKey;
    private Long timestampMs;
    private String productId;
    private String skuId;
    private String scopeType;
}
