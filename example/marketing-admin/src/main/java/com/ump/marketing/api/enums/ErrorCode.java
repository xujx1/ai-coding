package com.ump.marketing.api.enums;

/**
 * Unified error codes for all RPC interfaces.
 */
public enum ErrorCode {
    SUCCESS(0, "SUCCESS"),
    INVALID_ARGUMENT(40001, "INVALID_ARGUMENT"),
    ILLEGAL_STATE(40002, "ILLEGAL_STATE"),
    VERSION_CONFLICT(40003, "VERSION_CONFLICT"),
    IDEMPOTENCY_CONFLICT(40004, "IDEMPOTENCY_CONFLICT"),
    PERMISSION_DENIED(40301, "PERMISSION_DENIED"),
    RESOURCE_NOT_FOUND(40401, "RESOURCE_NOT_FOUND"),
    BUSINESS_CONFLICT(40901, "BUSINESS_CONFLICT"),
    DB_ERROR(50001, "DB_ERROR"),
    SYNC_ERROR(50002, "SYNC_ERROR"),
    KAFKA_ERROR(50003, "KAFKA_ERROR"),
    DOWNGRADED(50004, "DOWNGRADED"),
    INTERNAL_ERROR(50005, "INTERNAL_ERROR");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int getCode() { return code; }
    public String getMessage() { return message; }
}
