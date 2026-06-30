package com.ump.marketing.domain.statemachine;

import com.ump.marketing.api.enums.CouponStatus;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * State machine that validates coupon instance status transitions.
 *
 * Allowed transitions:
 *   CREATED  -> ISSUED
 *   ISSUED   -> RECEIVED
 *   RECEIVED -> USED
 *   RECEIVED -> EXPIRED
 *   USED     -> REFUNDED
 *   CREATED  -> VOIDED
 *   ISSUED   -> VOIDED
 *   RECEIVED -> VOIDED
 */
public final class CouponStateMachine {

    private static final Set<String> ALLOWED_TRANSITIONS;

    static {
        Set<String> transitions = new HashSet<String>();
        transitions.add(key(CouponStatus.CREATED, CouponStatus.ISSUED));
        transitions.add(key(CouponStatus.ISSUED, CouponStatus.RECEIVED));
        transitions.add(key(CouponStatus.RECEIVED, CouponStatus.USED));
        transitions.add(key(CouponStatus.RECEIVED, CouponStatus.EXPIRED));
        transitions.add(key(CouponStatus.USED, CouponStatus.REFUNDED));
        transitions.add(key(CouponStatus.CREATED, CouponStatus.VOIDED));
        transitions.add(key(CouponStatus.ISSUED, CouponStatus.VOIDED));
        transitions.add(key(CouponStatus.RECEIVED, CouponStatus.VOIDED));
        ALLOWED_TRANSITIONS = Collections.unmodifiableSet(transitions);
    }

    private CouponStateMachine() {
        // utility class
    }

    /**
     * Returns true if the transition from 'from' to 'to' is allowed.
     */
    public static boolean canTransit(CouponStatus from, CouponStatus to) {
        if (from == null || to == null) {
            return false;
        }
        return ALLOWED_TRANSITIONS.contains(key(from, to));
    }

    /**
     * Throws IllegalStateException if the transition from 'from' to 'to' is not allowed.
     */
    public static void assertTransition(CouponStatus from, CouponStatus to) {
        if (!canTransit(from, to)) {
            throw new IllegalStateException(
                    "Invalid coupon status transition: " + from + " -> " + to
            );
        }
    }

    /**
     * Returns true if a coupon in the given status can be used (applied to an order).
     * Only RECEIVED coupons can be used.
     */
    public static boolean canBeUsed(CouponStatus current) {
        return current == CouponStatus.RECEIVED;
    }

    /**
     * Returns true if a coupon in the given status can be received (claimed by a user).
     * Only ISSUED coupons can be received.
     */
    public static boolean canBeReceived(CouponStatus current) {
        return current == CouponStatus.ISSUED;
    }

    private static String key(CouponStatus from, CouponStatus to) {
        return from.name() + "->" + to.name();
    }
}
