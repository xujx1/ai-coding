package com.ump.marketing.domain;

import com.ump.marketing.api.enums.CouponStatus;
import com.ump.marketing.domain.statemachine.CouponStateMachine;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("CouponStateMachine")
class CouponStateMachineTest {

    @Test
    @DisplayName("All valid coupon status transitions return true from canTransit")
    void testValidTransitions() {
        assertTrue(CouponStateMachine.canTransit(CouponStatus.CREATED, CouponStatus.ISSUED),
                "CREATED -> ISSUED should be allowed");
        assertTrue(CouponStateMachine.canTransit(CouponStatus.ISSUED, CouponStatus.RECEIVED),
                "ISSUED -> RECEIVED should be allowed");
        assertTrue(CouponStateMachine.canTransit(CouponStatus.RECEIVED, CouponStatus.USED),
                "RECEIVED -> USED should be allowed");
        assertTrue(CouponStateMachine.canTransit(CouponStatus.RECEIVED, CouponStatus.EXPIRED),
                "RECEIVED -> EXPIRED should be allowed");
        assertTrue(CouponStateMachine.canTransit(CouponStatus.USED, CouponStatus.REFUNDED),
                "USED -> REFUNDED should be allowed");
        assertTrue(CouponStateMachine.canTransit(CouponStatus.CREATED, CouponStatus.VOIDED),
                "CREATED -> VOIDED should be allowed");
        assertTrue(CouponStateMachine.canTransit(CouponStatus.ISSUED, CouponStatus.VOIDED),
                "ISSUED -> VOIDED should be allowed");
        assertTrue(CouponStateMachine.canTransit(CouponStatus.RECEIVED, CouponStatus.VOIDED),
                "RECEIVED -> VOIDED should be allowed");
    }

    @Test
    @DisplayName("USED coupons cannot be received or used again")
    void testUsedCannotReceive() {
        assertFalse(CouponStateMachine.canBeUsed(CouponStatus.USED),
                "canBeUsed(USED) should return false");
        assertFalse(CouponStateMachine.canBeReceived(CouponStatus.USED),
                "canBeReceived(USED) should return false");
    }

    @Test
    @DisplayName("canBeUsed returns true only for RECEIVED status")
    void testCanBeUsedOnlyFromReceived() {
        assertTrue(CouponStateMachine.canBeUsed(CouponStatus.RECEIVED),
                "canBeUsed(RECEIVED) should return true");
        assertFalse(CouponStateMachine.canBeUsed(CouponStatus.ISSUED),
                "canBeUsed(ISSUED) should return false");
        assertFalse(CouponStateMachine.canBeUsed(CouponStatus.CREATED),
                "canBeUsed(CREATED) should return false");
    }

    @Test
    @DisplayName("canBeReceived returns true only for ISSUED status")
    void testCanBeReceivedOnlyFromIssued() {
        assertTrue(CouponStateMachine.canBeReceived(CouponStatus.ISSUED),
                "canBeReceived(ISSUED) should return true");
        assertFalse(CouponStateMachine.canBeReceived(CouponStatus.CREATED),
                "canBeReceived(CREATED) should return false");
        assertFalse(CouponStateMachine.canBeReceived(CouponStatus.RECEIVED),
                "canBeReceived(RECEIVED) should return false");
    }

    @Test
    @DisplayName("USED to USED transition is forbidden (no self-transition)")
    void testUsedToUsedForbidden() {
        assertFalse(CouponStateMachine.canTransit(CouponStatus.USED, CouponStatus.USED),
                "USED -> USED should not be allowed");
    }

    @Test
    @DisplayName("EXPIRED coupons cannot be used")
    void testExpiredCannotBeUsed() {
        assertFalse(CouponStateMachine.canBeUsed(CouponStatus.EXPIRED),
                "canBeUsed(EXPIRED) should return false");
    }
}
