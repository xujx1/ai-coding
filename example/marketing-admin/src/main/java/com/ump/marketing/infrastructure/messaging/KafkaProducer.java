package com.ump.marketing.infrastructure.messaging;

import com.ump.marketing.domain.model.SyncEvent;
import java.util.List;

/**
 * Kafka producer interface (mock implementation for Sprint 1).
 */
public interface KafkaProducer {
    /**
     * Send sync event to Kafka topic. Returns true on success.
     */
    boolean send(String topic, SyncEvent event);

    /**
     * Get all sent events for a topic (test/inspection).
     */
    List<SyncEvent> getSentEvents(String topic);

    /**
     * Clear sent events (for test reset).
     */
    void clear();
}
