package com.ump.marketing.infrastructure.messaging;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiConsumer;

/**
 * In-memory mock implementation of CanalBinlogListener for Sprint 1.
 * Records and forwards binlog events to registered handlers. Events can be fired
 * programmatically via {@link #fireBinlogEvent(String, String, String)} to simulate
 * database row changes in tests.
 */
@Component
public class MockCanalBinlogListener implements CanalBinlogListener {

    /** Handlers receive (tableName, eventType, payload) */
    private final List<TriConsumer<String, String, String>> handlers = new CopyOnWriteArrayList<>();

    /**
     * Functional interface for a three-argument event handler.
     */
    @FunctionalInterface
    public interface TriConsumer<A, B, C> {
        void accept(A a, B b, C c);
    }

    /**
     * Register a handler to be invoked when a binlog event is fired.
     */
    public void registerHandler(TriConsumer<String, String, String> handler) {
        handlers.add(handler);
    }

    /**
     * Programmatically fire a simulated binlog event. All registered handlers will be invoked.
     */
    public void fireBinlogEvent(String tableName, String eventType, String payload) {
        for (TriConsumer<String, String, String> handler : handlers) {
            handler.accept(tableName, eventType, payload);
        }
    }

    /**
     * Implementation of {@link CanalBinlogListener#onBinlogEvent(String, String, String)};
     * forwards to all registered handlers.
     */
    @Override
    public void onBinlogEvent(String tableName, String eventType, String payload) {
        fireBinlogEvent(tableName, eventType, payload);
    }

    /**
     * Clear all registered handlers (for test reset).
     */
    public void clear() {
        handlers.clear();
    }
}
