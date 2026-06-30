package com.ump.marketing.api.enums;

/**
 * Activity lifecycle states.
 */
public enum ActivityStatus {
    DRAFT,
    PENDING_APPROVAL,
    APPROVED,
    ONLINE,
    PAUSED,
    TERMINATED,
    REJECTED;

    public boolean isTerminal() {
        return this == TERMINATED;
    }
}
