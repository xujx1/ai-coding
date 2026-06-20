package com.ump.marketing.infrastructure.config;

import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Simple ID generator for domain entities, events, and requests.
 * <p>
 * Produces human-readable, sufficiently unique identifiers suitable for Sprint 1.
 * In production this would be replaced by a distributed ID generator (e.g. Snowflake).
 */
@Component
public class IdGenerator {

    private static final char[] HEX_CHARS = "0123456789abcdef".toCharArray();

    /**
     * Generate a prefixed ID using a truncated UUID (first 16 hex characters).
     * Example: {@code generateId("act")} returns something like {@code act-a1b2c3d4e5f67890}.
     */
    public String generateId(String prefix) {
        String uuidHex = UUID.randomUUID().toString().replace("-", "");
        return prefix + "-" + uuidHex.substring(0, 16);
    }

    /**
     * Generate a full event ID prefixed with "evt-".
     * Example: {@code evt-550e8400-e29b-41d4-a716-446655440000}
     */
    public String generateEventId() {
        return "evt-" + UUID.randomUUID().toString();
    }

    /**
     * Generate a request ID prefixed with "req-", containing the current timestamp in milliseconds
     * and a 4-character random hex suffix.
     * Example: {@code req-1718700000000-a3f9}
     */
    public String generateRequestId() {
        long ts = System.currentTimeMillis();
        int rnd = ThreadLocalRandom.current().nextInt(0x10000); // 0..65535
        char[] hex = new char[4];
        hex[0] = HEX_CHARS[(rnd >>> 12) & 0xF];
        hex[1] = HEX_CHARS[(rnd >>> 8) & 0xF];
        hex[2] = HEX_CHARS[(rnd >>> 4) & 0xF];
        hex[3] = HEX_CHARS[rnd & 0xF];
        return "req-" + ts + "-" + new String(hex);
    }
}
