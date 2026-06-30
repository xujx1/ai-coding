package com.ump.marketing.application.service;

import com.ump.marketing.domain.model.SyncEvent;
import com.ump.marketing.domain.model.SyncEventLog;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.config.KafkaTopicConfig;
import com.ump.marketing.infrastructure.dlq.DlqService;
import com.ump.marketing.infrastructure.mapper.SyncEventLogMapper;
import com.ump.marketing.infrastructure.messaging.KafkaProducer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Publishes B-to-C and C-to-B sync events via Kafka with reliable logging and DLQ fallback.
 */
@Service
public class SyncEventPublisher {

    @Autowired
    private KafkaProducer kafkaProducer;

    @Autowired
    private IdGenerator idGenerator;

    @Autowired
    private SyncEventLogMapper syncEventLogMapper;

    @Autowired
    private DlqService dlqService;

    /**
     * Publish a B-to-C sync event (business-side changes propagated to C-end runtime).
     * Returns the generated event ID for correlation.
     *
     * @param eventType     the event type (e.g. ACTIVITY_ONLINE, PRODUCT_BOUND)
     * @param aggregateType the aggregate type
     * @param aggregateId   the aggregate ID
     * @param regionCode    the region code
     * @param version       the aggregate version after the change
     * @param payload       JSON payload of the event
     * @return the generated event ID
     */
    public String publishEvent(String eventType, String aggregateType, String aggregateId,
                               String regionCode, Long version, String payload) {
        long now = System.currentTimeMillis();
        SyncEvent event = SyncEvent.of(
                idGenerator.generateEventId(), eventType, aggregateType, aggregateId,
                regionCode, version, payload, now
        );

        String topic = KafkaTopicConfig.B_TO_C_SYNC_TOPIC;
        boolean sent = kafkaProducer.send(topic, event);

        // Log the event for observability and replay
        SyncEventLog log = new SyncEventLog();
        log.setEventId(event.getEventId());
        log.setEventType(eventType);
        log.setAggregateType(aggregateType);
        log.setAggregateId(aggregateId);
        log.setRegionCode(regionCode);
        log.setVersion(version);
        log.setPayload(payload);
        log.setConsumerGroup("b2c-runtime");
        log.setConsumeStatus(sent ? SyncEventLog.STATUS_SUCCESS : SyncEventLog.STATUS_PENDING);
        log.setOccurredAt(now);
        log.setCreatedAt(now);
        log.setUpdatedAt(now);
        if (!sent) {
            log.setErrorMessage("Kafka send failed");
            dlqService.sendToDlq(event.getEventId(), topic, "b2c-runtime", payload, "Kafka send failed", regionCode);
        }
        syncEventLogMapper.insert(log);

        return event.getEventId();
    }

    /**
     * Publish a C-to-B event (C-end actions propagated back to business-side).
     *
     * @param eventType     the event type
     * @param aggregateType the aggregate type
     * @param aggregateId   the aggregate ID
     * @param regionCode    the region code
     * @param version       the aggregate version
     * @param payload       JSON payload
     * @return the generated event ID
     */
    public String publishC2BEvent(String eventType, String aggregateType, String aggregateId,
                                  String regionCode, Long version, String payload) {
        SyncEvent event = SyncEvent.of(
                idGenerator.generateEventId(), eventType, aggregateType, aggregateId,
                regionCode, version, payload, System.currentTimeMillis()
        );
        kafkaProducer.send(KafkaTopicConfig.C_TO_B_EVENT_TOPIC, event);
        return event.getEventId();
    }
}
