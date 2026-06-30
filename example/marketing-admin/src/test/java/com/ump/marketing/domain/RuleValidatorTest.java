package com.ump.marketing.domain;

import com.ump.marketing.domain.service.RuleValidator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("RuleValidator")
class RuleValidatorTest {

    // --- Activity time validation ---

    @Test
    @DisplayName("validateActivityTime with startTime < endTime does not throw")
    void testValidActivityTime() {
        assertDoesNotThrow(() -> RuleValidator.validateActivityTime(1000L, 2000L),
                "startTime=1000, endTime=2000 should be valid");
    }

    @Test
    @DisplayName("validateActivityTime throws when startTime >= endTime")
    void testActivityTimeStartAfterEnd() {
        assertThrows(IllegalArgumentException.class,
                () -> RuleValidator.validateActivityTime(2000L, 1000L),
                "startTime=2000, endTime=1000 should throw IllegalArgumentException");
    }

    @Test
    @DisplayName("validateActivityTime throws when startTime is null")
    void testActivityTimeNullStart() {
        assertThrows(IllegalArgumentException.class,
                () -> RuleValidator.validateActivityTime(null, 2000L),
                "null startTime should throw IllegalArgumentException");
    }

    // --- Coupon template validation ---

    @Test
    @DisplayName("validateCouponTemplate with valid fields does not throw")
    void testValidCouponTemplate() {
        assertDoesNotThrow(() -> RuleValidator.validateCouponTemplate(
                        new BigDecimal("10"), BigDecimal.ZERO, 100, 1),
                "faceValue=10, minAmount=0, totalCount=100, perUserLimit=1 should be valid");
    }

    @Test
    @DisplayName("validateCouponTemplate throws when faceValue is negative")
    void testInvalidCouponTemplateNegativeValue() {
        assertThrows(IllegalArgumentException.class,
                () -> RuleValidator.validateCouponTemplate(
                        new BigDecimal("-1"), BigDecimal.ZERO, 100, 1),
                "negative faceValue should throw IllegalArgumentException");
    }

    // --- Idempotency key validation ---

    @Test
    @DisplayName("validateIdempotencyKey with non-empty key does not throw")
    void testValidIdempotencyKey() {
        assertDoesNotThrow(() -> RuleValidator.validateIdempotencyKey("abc123"),
                "\"abc123\" should be a valid idempotency key");
    }

    @Test
    @DisplayName("validateIdempotencyKey throws when key is null")
    void testNullIdempotencyKey() {
        assertThrows(IllegalArgumentException.class,
                () -> RuleValidator.validateIdempotencyKey(null),
                "null idempotency key should throw IllegalArgumentException");
    }

    @Test
    @DisplayName("validateIdempotencyKey throws when key is empty string")
    void testEmptyIdempotencyKey() {
        assertThrows(IllegalArgumentException.class,
                () -> RuleValidator.validateIdempotencyKey(""),
                "empty idempotency key should throw IllegalArgumentException");
    }

    // --- Region code validation ---

    @Test
    @DisplayName("validateRegionCode with valid code does not throw")
    void testValidRegionCode() {
        assertDoesNotThrow(() -> RuleValidator.validateRegionCode("CN"),
                "\"CN\" should be a valid region code");
    }

    @Test
    @DisplayName("validateRegionCode throws when region code is null")
    void testNullRegionCode() {
        assertThrows(IllegalArgumentException.class,
                () -> RuleValidator.validateRegionCode(null),
                "null region code should throw IllegalArgumentException");
    }
}
