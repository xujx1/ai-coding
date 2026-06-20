package com.ump.marketing.domain.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Utility for generating deterministic scope keys and routing sharded table indices.
 */
public final class ScopeKeyGenerator {

    private static final char[] HEX_CHARS = "0123456789abcdef".toCharArray();

    private ScopeKeyGenerator() {
        // utility class
    }

    /**
     * Generates a deterministic hash-based scope key using SHA-256.
     * Returns the first 16 hex characters of SHA-256(regionCode:scopeType:productId:skuId).
     * When skuId is null (product-level scope), it is treated as empty string.
     *
     * @param regionCode region code
     * @param scopeType  scope type (e.g. PRODUCT, SKU)
     * @param productId  product identifier
     * @param skuId      SKU identifier, may be null for product-level scope
     * @return 16-character hex string derived from SHA-256
     */
    public static String generateScopeKey(String regionCode, String scopeType, String productId, String skuId) {
        String skuPart = skuId != null ? skuId : "";
        String raw = regionCode + ":" + scopeType + ":" + productId + ":" + skuPart;
        return sha256Hex16(raw);
    }

    /**
     * Computes a sharded table index in [0, tableCount) for the given region and shard key.
     * Uses String.hashCode() as a stable hash, ensures a non-negative result, and guards
     * against Integer.MIN_VALUE (whose Math.abs is still negative).
     *
     * @param regionCode region code
     * @param shardKey   the sharding key (e.g. scopeKey, orderId, userId)
     * @param tableCount total number of sharded tables
     * @return table index in [0, tableCount)
     */
    public static int routeTableIndex(String regionCode, String shardKey, int tableCount) {
        String raw = regionCode + ":" + shardKey;
        int hash = raw.hashCode();
        int positive = Math.abs(hash);
        // Math.abs(Integer.MIN_VALUE) == Integer.MIN_VALUE which is negative, guard against that
        if (positive < 0) {
            positive = 0;
        }
        return positive % tableCount;
    }

    private static String sha256Hex16(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            // First 8 bytes -> 16 hex chars
            char[] hex = new char[16];
            for (int i = 0; i < 8; i++) {
                int b = hashBytes[i] & 0xFF;
                hex[i * 2] = HEX_CHARS[b >>> 4];
                hex[i * 2 + 1] = HEX_CHARS[b & 0x0F];
            }
            return new String(hex);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed to be available in every JVM
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }
}
