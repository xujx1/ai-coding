package com.ump.marketing.infrastructure.cache;

import java.util.concurrent.TimeUnit;

/**
 * Local in-memory cache interface backed by Caffeine for Sprint 1.
 */
public interface LocalCache {
    void put(String namespace, String key, Object value, long ttl, TimeUnit unit);
    <T> T get(String namespace, String key, Class<T> type);
    void invalidate(String namespace, String key);
    boolean isMember(String namespace, String key);
}
