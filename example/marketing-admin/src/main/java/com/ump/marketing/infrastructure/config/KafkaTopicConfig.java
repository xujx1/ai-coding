package com.ump.marketing.infrastructure.config;

import org.springframework.context.annotation.Configuration;

/**
 * Centralized Kafka topic name constants for the marketing platform.
 */
@Configuration
public class KafkaTopicConfig {

    /** B-end to C-end data sync topic (e.g. activity/coupon template changes propagated to C-end). */
    public static final String B_TO_C_SYNC_TOPIC = "marketing.b2c.sync";

    /** C-end to B-end event topic (e.g. coupon receive/use events sent back to B-end). */
    public static final String C_TO_B_EVENT_TOPIC = "marketing.c2b.event";

    /** Activity force-offline notification topic. */
    public static final String ACTIVITY_FORCE_OFFLINE_TOPIC = "marketing.activity.force_offline";
}
