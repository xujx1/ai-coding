package com.ump.marketing.infrastructure.messaging;

import com.ump.marketing.domain.model.SyncEvent;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * In-memory mock implementation of KafkaProducer for Sprint 1.
 * Stores events in a ConcurrentHashMap and immediately dispatches to registered consumers,
 * simulating real-time consumption for integration tests.
 */
@Component
@Primary
public class MockKafkaProducer implements KafkaProducer {

    private final ConcurrentHashMap<String, List<SyncEvent>> sentEvents = new ConcurrentHashMap<>();

    /** topic -> list of consumers */
    private final ConcurrentHashMap<String, List<Consumer<SyncEvent>>> consumers = new ConcurrentHashMap<>();

    private volatile boolean failOnSend = false;

    /**
     * When set to true, send() will return false to simulate Kafka send failures (useful for DLQ testing).
     */
    public void setFailOnSend(boolean failOnSend) {
        this.failOnSend = failOnSend;
    }

    /**
     * Register a consumer that will be invoked immediately when an event is sent to the given topic.
     */
    public void registerConsumer(String topic, Consumer<SyncEvent> consumer) {
        consumers.computeIfAbsent(topic, k -> new CopyOnWriteArrayList<>()).add(consumer);
    }

    @Override
    public boolean send(String topic, SyncEvent event) {
        if (failOnSend) {
            return false;
        }
        sentEvents.computeIfAbsent(topic, k -> new CopyOnWriteArrayList<>()).add(event);
        // Immediately dispatch to registered consumers (simulating real-time consumption)
        List<Consumer<SyncEvent>> topicConsumers = consumers.get(topic);
        if (topicConsumers != null) {
            for (Consumer<SyncEvent> consumer : topicConsumers) {
                try {
                    consumer.accept(event);
                } catch (Exception e) {
                    // Swallow consumer exceptions in mock; real Kafka would route to DLQ
                }
            }
        }
        return true;
    }

    @Override
    public List<SyncEvent> getSentEvents(String topic) {
        return sentEvents.getOrDefault(topic, Collections.emptyList());
    }

    @Override
    public void clear() {
        sentEvents.clear();
    }
}
