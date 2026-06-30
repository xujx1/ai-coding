package com.ump.marketing.domain;

import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.domain.statemachine.ActivityStateMachine;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ActivityStateMachine")
class ActivityStateMachineTest {

    @Test
    @DisplayName("All valid status transitions return true from canTransit")
    void testAllValidTransitions() {
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.DRAFT, ActivityStatus.PENDING_APPROVAL),
                "DRAFT -> PENDING_APPROVAL should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.PENDING_APPROVAL, ActivityStatus.APPROVED),
                "PENDING_APPROVAL -> APPROVED should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.PENDING_APPROVAL, ActivityStatus.REJECTED),
                "PENDING_APPROVAL -> REJECTED should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.REJECTED, ActivityStatus.DRAFT),
                "REJECTED -> DRAFT should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.APPROVED, ActivityStatus.ONLINE),
                "APPROVED -> ONLINE should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.ONLINE, ActivityStatus.PAUSED),
                "ONLINE -> PAUSED should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.PAUSED, ActivityStatus.ONLINE),
                "PAUSED -> ONLINE should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.ONLINE, ActivityStatus.TERMINATED),
                "ONLINE -> TERMINATED should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.PAUSED, ActivityStatus.TERMINATED),
                "PAUSED -> TERMINATED should be allowed");
        assertTrue(ActivityStateMachine.canTransit(ActivityStatus.APPROVED, ActivityStatus.TERMINATED),
                "APPROVED -> TERMINATED should be allowed");
    }

    @Test
    @DisplayName("TERMINATED status cannot transition to any other status")
    void testTerminatedCannotTransitToAny() {
        for (ActivityStatus target : ActivityStatus.values()) {
            assertFalse(ActivityStateMachine.canTransit(ActivityStatus.TERMINATED, target),
                    "TERMINATED -> " + target + " should not be allowed");
        }
    }

    @Test
    @DisplayName("ONLINE to DRAFT transition is forbidden")
    void testOnlineToDraftForbidden() {
        assertFalse(ActivityStateMachine.canTransit(ActivityStatus.ONLINE, ActivityStatus.DRAFT),
                "ONLINE -> DRAFT should not be allowed");
    }

    @Test
    @DisplayName("PAUSED to DRAFT transition is forbidden")
    void testPausedToDraftForbidden() {
        assertFalse(ActivityStateMachine.canTransit(ActivityStatus.PAUSED, ActivityStatus.DRAFT),
                "PAUSED -> DRAFT should not be allowed");
    }

    @Test
    @DisplayName("assertTransition throws IllegalStateException on invalid transition")
    void testAssertTransitionThrowsOnInvalid() {
        assertThrows(IllegalStateException.class,
                () -> ActivityStateMachine.assertTransition(ActivityStatus.TERMINATED, ActivityStatus.ONLINE),
                "assertTransition(TERMINATED, ONLINE) should throw IllegalStateException");
    }

    @Test
    @DisplayName("All non-TERMINATED statuses can be force-offlined")
    void testCanForceOfflineNonTerminal() {
        for (ActivityStatus status : ActivityStatus.values()) {
            if (status != ActivityStatus.TERMINATED) {
                assertTrue(ActivityStateMachine.canForceOffline(status),
                        "canForceOffline(" + status + ") should return true");
            }
        }
    }

    @Test
    @DisplayName("TERMINATED status cannot be force-offlined")
    void testCannotForceOfflineTerminated() {
        assertFalse(ActivityStateMachine.canForceOffline(ActivityStatus.TERMINATED),
                "canForceOffline(TERMINATED) should return false");
    }
}
