package com.ump.marketing.api.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import java.io.Serializable;

/**
 * Common fields for all requests.
 */
@Data
public class BaseRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    @NotBlank(message = "requestId is required")
    private String requestId;
    private String caller;
    @NotBlank(message = "operator is required")
    private String operator;
    @NotBlank(message = "regionCode is required")
    private String regionCode;
    @NotBlank(message = "idempotencyKey is required")
    private String idempotencyKey;
    private Long timestampMs;
    private Integer expectedVersion;
}
