package com.ump.marketing.domain.statemachine;

import com.ump.marketing.api.enums.ActivityStatus;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * State machine that validates activity status transitions.
 *
 * Allowed transitions:
 *   DRAFT -> PENDING_APPROVAL
 *   PENDING_APPROVAL -> APPROVED
 *   PENDING_APPROVAL -> REJECTED
 *   REJECTED -> DRAFT
 *   APPROVED -> ONLINE
 *   ONLINE -> PAUSED
 *   PAUSED -> ONLINE
 *   ONLINE -> TERMINATED
 *   PAUSED -> TERMINATED
 *   APPROVED -> TERMINATED
 *
 * Forbidden:
 *   ONLINE -> DRAFT
 *   PAUSED -> DRAFT
 *   TERMINATED -> anything
 */
public final class ActivityStateMachine {

    private static final Set<String> ALLOWED_TRANSITIONS;

    private static final Set<ActivityStatus> TERMINAL_STATUSES;

    static {
        Set<String> transitions = new HashSet<String>();
        transitions.add(key(ActivityStatus.DRAFT, ActivityStatus.PENDING_APPROVAL));
        transitions.add(key(ActivityStatus.PENDING_APPROVAL, ActivityStatus.APPROVED));
        transitions.add(key(ActivityStatus.PENDING_APPROVAL, ActivityStatus.REJECTED));
        transitions.add(key(ActivityStatus.REJECTED, ActivityStatus.DRAFT));
        transitions.add(key(ActivityStatus.APPROVED, ActivityStatus.ONLINE));
        transitions.add(key(ActivityStatus.ONLINE, ActivityStatus.PAUSED));
        transitions.add(key(ActivityStatus.PAUSED, ActivityStatus.ONLINE));
        transitions.add(key(ActivityStatus.ONLINE, ActivityStatus.TERMINATED));
        transitions.add(key(ActivityStatus.PAUSED, ActivityStatus.TERMINATED));
        transitions.add(key(ActivityStatus.APPROVED, ActivityStatus.TERMINATED));
        ALLOWED_TRANSITIONS = Collections.unmodifiableSet(transitions);

        TERMINAL_STATUSES = Collections.unmodifiableSet(
                new HashSet<ActivityStatus>(Arrays.asList(ActivityStatus.TERMINATED))
        );
    }

    private ActivityStateMachine() {
        // utility class
    }

    /**
     * Returns true if the transition from 'from' to 'to' is allowed.
     */
    public static boolean canTransit(ActivityStatus from, ActivityStatus to) {
        if (from == null || to == null) {
            return false;
        }
        return ALLOWED_TRANSITIONS.contains(key(from, to));
    }

    /**
     * Throws IllegalStateException if the transition from 'from' to 'to' is not allowed.
     */
    public static void assertTransition(ActivityStatus from, ActivityStatus to) {
        if (!canTransit(from, to)) {
            throw new IllegalStateException(
                    "Invalid activity status transition: " + from + " -> " + to
            );
        }
    }

    /**
     * Returns true if the activity in the given status can be force-offlined.
     * Any non-terminal status can be forced offline (to TERMINATED).
     */
    public static boolean canForceOffline(ActivityStatus from) {
        if (from == null) {
            return false;
        }
        return !TERMINAL_STATUSES.contains(from);
    }

    private static String key(ActivityStatus from, ActivityStatus to) {
        return from.name() + "->" + to.name();
    }
}
