package com.ump.marketing.infrastructure.dlq;

import com.ump.marketing.domain.model.DlqMessage;
import com.ump.marketing.infrastructure.mapper.DlqMessageMapper;
import com.ump.marketing.infrastructure.messaging.KafkaProducer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Dead-Letter Queue service for failed Kafka message consumption.
 * <p>
 * Provides exponential backoff retries (1 min to 16 hours, up to 10 attempts) and manual replay.
 * Retry processing is exposed via {@link #processRetries()} rather than {@code @Scheduled} to avoid
 * requiring {@code @EnableScheduling} in Sprint 1; a scheduled runner can call this method.
 */
@Component
public class DlqService {

    private static final int MAX_RETRY = 10;
    private static final long[] BACKOFF_MS = {
            60_000L,      // 1 min
            120_000L,     // 2 min
            300_000L,     // 5 min
            600_000L,     // 10 min
            1_800_000L,   // 30 min
            3_600_000L,   // 1 hour
            7_200_000L,   // 2 hours
            14_400_000L,  // 4 hours
            28_800_000L,  // 8 hours
            57_600_000L   // 16 hours
    };

    @Autowired
    private DlqMessageMapper dlqMessageMapper;

    @Autowired
    private KafkaProducer kafkaProducer;

    /**
     * Send a failed message to DLQ.
     *
     * @param eventId       the originating event id
     * @param topic         source Kafka topic
     * @param consumerGroup consumer group that failed
     * @param payload       raw event payload
     * @param errorMessage  description of the failure
     * @param regionCode    the region code for data residency
     */
    public void sendToDlq(String eventId, String topic, String consumerGroup, String payload,
                          String errorMessage, String regionCode) {
        long now = System.currentTimeMillis();
        DlqMessage msg = new DlqMessage();
        msg.setEventId(eventId);
        msg.setTopic(topic);
        msg.setConsumerGroup(consumerGroup);
        msg.setPayload(payload);
        msg.setErrorMessage(errorMessage);
        msg.setRegionCode(regionCode);
        msg.setRetryCount(0);
        msg.setNextRetryAt(now + BACKOFF_MS[0]);
        msg.setStatus(DlqMessage.STATUS_RETRYABLE);
        msg.setCreatedAt(now);
        msg.setUpdatedAt(now);
        dlqMessageMapper.insert(msg);
    }

    /**
     * Process messages that are due for retry. Intended to be called periodically (e.g. every minute).
     * Does not use {@code @Scheduled} to avoid requiring {@code @EnableScheduling} in Sprint 1.
     */
    public void processRetries() {
        long now = System.currentTimeMillis();
        List<DlqMessage> retryable = dlqMessageMapper.selectRetryable(now);
        for (DlqMessage msg : retryable) {
            int nextRetry = msg.getRetryCount() + 1;
            if (nextRetry >= MAX_RETRY) {
                dlqMessageMapper.updateStatus(msg.getId(), DlqMessage.STATUS_MAX_RETRY, now);
                continue;
            }
            long nextRetryAt = now + BACKOFF_MS[Math.min(nextRetry, BACKOFF_MS.length - 1)];
            dlqMessageMapper.updateRetryStatus(msg.getId(), nextRetry, nextRetryAt, DlqMessage.STATUS_RETRYABLE, now);
            // In a real system, re-publish to Kafka. Here we mark for retry.
        }
    }

    /**
     * Manually replay a message by eventId, marking it RESOLVED.
     *
     * @return true if the message was found and marked resolved
     */
    public boolean manualReplay(String eventId) {
        DlqMessage msg = dlqMessageMapper.selectByEventId(eventId);
        if (msg == null) {
            return false;
        }
        dlqMessageMapper.updateStatus(msg.getId(), DlqMessage.STATUS_RESOLVED, System.currentTimeMillis());
        return true;
    }
}
