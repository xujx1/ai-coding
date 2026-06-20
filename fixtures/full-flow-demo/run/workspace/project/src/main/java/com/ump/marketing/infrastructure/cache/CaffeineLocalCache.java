package com.ump.marketing.infrastructure.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.concurrent.TimeUnit;

/**
 * Caffeine-backed {@link LocalCache} implementation.
 * <p>
 * Supports two logical namespaces:
 * <ul>
 *   <li>{@code "blacklist"} - used as a set (e.g. force-offline activities); entries are added via
 *       {@code put("blacklist", key, Boolean.TRUE, ttl, unit)} and checked with {@link #isMember}.</li>
 *   <li>general - any other namespace string for general key/value caching.</li>
 * </ul>
 * Per-entry TTL is supported via Caffeine's variable-expiry {@link Expiry} policy.
 */
@Component
public class CaffeineLocalCache implements LocalCache {

    /**
     * Wrapper that holds the actual value alongside its intended TTL (in nanoseconds from creation).
     */
    private static class CacheEntry {
        final Object value;
        final long ttlNanos;

        CacheEntry(Object value, long ttlNanos) {
            this.value = value;
            this.ttlNanos = ttlNanos;
        }
    }

    private Cache<String, CacheEntry> cache;

    @PostConstruct
    public void init() {
        this.cache = Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfter(new Expiry<String, CacheEntry>() {
                    @Override
                    public long expireAfterCreate(String key, CacheEntry entry, long currentTime) {
                        return entry.ttlNanos;
                    }

                    @Override
                    public long expireAfterUpdate(String key, CacheEntry entry, long currentTime, long currentDuration) {
                        return entry.ttlNanos;
                    }

                    @Override
                    public long expireAfterRead(String key, CacheEntry entry, long currentTime, long currentDuration) {
                        return currentDuration; // do not reset expiry on read
                    }
                })
                .build();
    }

    private static String compositeKey(String namespace, String key) {
        return namespace + ":" + key;
    }

    @Override
    public void put(String namespace, String key, Object value, long ttl, TimeUnit unit) {
        long ttlNanos = unit.toNanos(ttl);
        cache.put(compositeKey(namespace, key), new CacheEntry(value, ttlNanos));
    }

    @Override
    @SuppressWarnings("unchecked")
    public <T> T get(String namespace, String key, Class<T> type) {
        CacheEntry entry = cache.getIfPresent(compositeKey(namespace, key));
        if (entry == null) {
            return null;
        }
        return (T) entry.value;
    }

    @Override
    public void invalidate(String namespace, String key) {
        cache.invalidate(compositeKey(namespace, key));
    }

    /**
     * Checks membership in a namespace used as a set (e.g. the "blacklist" namespace where
     * entries are added via {@code put(namespace, key, Boolean.TRUE, ...)}).
     */
    @Override
    public boolean isMember(String namespace, String key) {
        return cache.getIfPresent(compositeKey(namespace, key)) != null;
    }
}
