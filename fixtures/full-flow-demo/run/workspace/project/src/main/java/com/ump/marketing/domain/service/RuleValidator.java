package com.ump.marketing.domain.service;

import java.math.BigDecimal;

/**
 * Simple domain-level validation utilities.
 * All methods throw IllegalArgumentException when validation fails.
 */
public final class RuleValidator {

    private RuleValidator() {
        // utility class
    }

    /**
     * Validates activity time window.
     * Both startTime and endTime must be non-null and positive; startTime must be strictly less than endTime.
     *
     * @param startTime activity start time (epoch millis)
     * @param endTime   activity end time (epoch millis)
     * @throws IllegalArgumentException if validation fails
     */
    public static void validateActivityTime(Long startTime, Long endTime) {
        if (startTime == null) {
            throw new IllegalArgumentException("startTime must not be null");
        }
        if (endTime == null) {
            throw new IllegalArgumentException("endTime must not be null");
        }
        if (startTime <= 0L) {
            throw new IllegalArgumentException("startTime must be positive, got: " + startTime);
        }
        if (endTime <= 0L) {
            throw new IllegalArgumentException("endTime must be positive, got: " + endTime);
        }
        if (startTime >= endTime) {
            throw new IllegalArgumentException(
                    "startTime must be less than endTime, got startTime=" + startTime + ", endTime=" + endTime
            );
        }
    }

    /**
     * Validates coupon template fields.
     * faceValue must be positive; minAmount must be non-null and non-negative;
     * totalCount and perUserLimit must be positive.
     *
     * @param faceValue     coupon face value
     * @param minAmount     minimum order amount
     * @param totalCount    total coupon count
     * @param perUserLimit  per-user claim limit
     * @throws IllegalArgumentException if validation fails
     */
    public static void validateCouponTemplate(BigDecimal faceValue, BigDecimal minAmount,
                                              Integer totalCount, Integer perUserLimit) {
        if (faceValue == null) {
            throw new IllegalArgumentException("faceValue must not be null");
        }
        if (faceValue.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("faceValue must be positive, got: " + faceValue);
        }
        if (minAmount == null) {
            throw new IllegalArgumentException("minAmount must not be null");
        }
        if (minAmount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("minAmount must not be negative, got: " + minAmount);
        }
        if (totalCount == null || totalCount <= 0) {
            throw new IllegalArgumentException("totalCount must be positive, got: " + totalCount);
        }
        if (perUserLimit == null || perUserLimit <= 0) {
            throw new IllegalArgumentException("perUserLimit must be positive, got: " + perUserLimit);
        }
    }

    /**
     * Validates an idempotency key: must be non-null and non-empty (after trimming).
     *
     * @param key the idempotency key
     * @throws IllegalArgumentException if validation fails
     */
    public static void validateIdempotencyKey(String key) {
        if (key == null) {
            throw new IllegalArgumentException("idempotencyKey must not be null");
        }
        if (key.trim().isEmpty()) {
            throw new IllegalArgumentException("idempotencyKey must not be empty");
        }
    }

    /**
     * Validates a region code: must be non-null and non-empty (after trimming).
     *
     * @param regionCode the region code
     * @throws IllegalArgumentException if validation fails
     */
    public static void validateRegionCode(String regionCode) {
        if (regionCode == null) {
            throw new IllegalArgumentException("regionCode must not be null");
        }
        if (regionCode.trim().isEmpty()) {
            throw new IllegalArgumentException("regionCode must not be empty");
        }
    }
}
