package com.ump.marketing.infrastructure.messaging;

import com.ump.marketing.domain.model.SyncEvent;

/**
 * Interface for Kafka message consumers.
 */
public interface KafkaConsumer {
    String getTopic();
    String getConsumerGroup();
    void consume(SyncEvent event);
}
