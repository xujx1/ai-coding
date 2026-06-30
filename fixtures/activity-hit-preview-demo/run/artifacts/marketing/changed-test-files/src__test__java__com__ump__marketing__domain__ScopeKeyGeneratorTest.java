package com.ump.marketing.domain;

import com.ump.marketing.api.enums.ScopeType;
import com.ump.marketing.domain.service.ScopeKeyGenerator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ScopeKeyGenerator")
class ScopeKeyGeneratorTest {

    @Test
    @DisplayName("generateScopeKey returns the same result for identical inputs (deterministic)")
    void testScopeKeyIsDeterministic() {
        String key1 = ScopeKeyGenerator.generateScopeKey("CN", "SKU_LIST", "P1", "S1");
        String key2 = ScopeKeyGenerator.generateScopeKey("CN", "SKU_LIST", "P1", "S1");
        assertNotNull(key1);
        assertEquals(key1, key2, "Same inputs should produce identical scope keys");
    }

    @Test
    @DisplayName("generateScopeKey produces different keys for different region codes")
    void testScopeKeyDiffersForDifferentRegions() {
        String keyCn = ScopeKeyGenerator.generateScopeKey("CN", "SKU_LIST", "P1", "S1");
        String keyUs = ScopeKeyGenerator.generateScopeKey("US", "SKU_LIST", "P1", "S1");
        assertNotEquals(keyCn, keyUs,
                "Different region codes should produce different scope keys");
    }

    @Test
    @DisplayName("generateScopeKey produces different keys for different product IDs")
    void testScopeKeyDiffersForDifferentProducts() {
        String key1 = ScopeKeyGenerator.generateScopeKey("CN", "SKU_LIST", "P1", "S1");
        String key2 = ScopeKeyGenerator.generateScopeKey("CN", "SKU_LIST", "P2", "S1");
        assertNotEquals(key1, key2,
                "Different product IDs should produce different scope keys");
    }

    @Test
    @DisplayName("generateScopeKey differentiates product and SKU preview dimensions for the same product")
    void testPreviewScopeKeyDiffersBetweenProductAndSku() {
        String productKey = ScopeKeyGenerator.generateScopeKey("CN", ScopeType.PRODUCT.name(), "P1", null);
        String skuKey = ScopeKeyGenerator.generateScopeKey("CN", ScopeType.SKU.name(), "P1", "S1");

        assertNotEquals(productKey, skuKey,
                "Product preview and SKU preview must not share the same scope key");
    }

    @Test
    @DisplayName("generateScopeKey differentiates different skuIds under the same product preview")
    void testPreviewScopeKeyDiffersForDifferentSkuIds() {
        String skuKey1 = ScopeKeyGenerator.generateScopeKey("CN", ScopeType.SKU.name(), "P1", "S1");
        String skuKey2 = ScopeKeyGenerator.generateScopeKey("CN", ScopeType.SKU.name(), "P1", "S2");

        assertNotEquals(skuKey1, skuKey2,
                "Different SKU ids must produce different scope keys within the same product");
    }

    @Test
    @DisplayName("normalizePreview accepts preview aliases while enforcing SKU-first resolution")
    void testNormalizePreviewSupportsAliases() {
        assertEquals(ScopeType.PRODUCT, ScopeType.normalizePreview("spu", false));
        assertEquals(ScopeType.PRODUCT, ScopeType.normalizePreview("product-id", false));
        assertEquals(ScopeType.SKU, ScopeType.normalizePreview("sku-list", true));
        assertEquals(ScopeType.SKU, ScopeType.normalizePreview("sku_id", true));
    }

    @Test
    @DisplayName("normalizePreview rejects unsupported preview scope types")
    void testNormalizePreviewRejectsUnsupportedScopeTypes() {
        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class,
                () -> ScopeType.normalizePreview("CATEGORY", false));

        assertEquals("scopeType must be PRODUCT or SKU", exception.getMessage());
    }

    @Test
    @DisplayName("routeTableIndex returns values within [0, tableCount) for random inputs")
    void testRouteTableIndexInRange() {
        int[] tableCounts = {16, 32, 64};
        for (int tableCount : tableCounts) {
            for (int i = 0; i < 200; i++) {
                String region = (i % 2 == 0) ? "CN" : "US";
                String shardKey = "key-" + i;
                int index = ScopeKeyGenerator.routeTableIndex(region, shardKey, tableCount);
                assertTrue(index >= 0 && index < tableCount,
                        "routeTableIndex(" + region + ", " + shardKey + ", " + tableCount +
                                ") returned " + index + ", expected range [0, " + (tableCount - 1) + "]");
            }
        }
    }

    @Test
    @DisplayName("routeTableIndex is stable: same inputs always produce same output")
    void testRouteTableIndexStable() {
        int idx1 = ScopeKeyGenerator.routeTableIndex("CN", "order-12345", 16);
        int idx2 = ScopeKeyGenerator.routeTableIndex("CN", "order-12345", 16);
        assertEquals(idx1, idx2,
                "Same inputs to routeTableIndex should produce identical results");
    }

    @Test
    @DisplayName("routeTableIndex never returns negative values, including edge-case hash keys")
    void testRouteTableIndexHandlesIntegerMinValue() {
        String[] edgeKeys = {
                "",
                "\u0000",
                "\u0000\u0001\u0000\u0000",
                "test",
                "CN:order-9999999999",
                "polygenelubricants",
                "ZZZZZZZZ",
                "!!!"
        };
        for (String key : edgeKeys) {
            for (String region : new String[]{"CN", "US", "EU", "JP"}) {
                int index = ScopeKeyGenerator.routeTableIndex(region, key, 16);
                assertTrue(index >= 0,
                        "routeTableIndex(\"" + region + "\", \"" + key + "\", 16) must be non-negative, got: " + index);
            }
        }
    }

    @Test
    @DisplayName("routeTableIndex distributes 1000 keys across 16 shards without empty shards")
    void testRouteTableIndexDistributes() {
        int tableCount = 16;
        Map<Integer, Integer> distribution = new HashMap<>();
        for (int i = 0; i < tableCount; i++) {
            distribution.put(i, 0);
        }

        for (int i = 0; i < 1000; i++) {
            int index = ScopeKeyGenerator.routeTableIndex("CN", "shard-" + i, tableCount);
            distribution.merge(index, 1, Integer::sum);
        }

        for (int shard = 0; shard < tableCount; shard++) {
            int count = distribution.get(shard);
            assertTrue(count > 0,
                    "Shard " + shard + " should have at least 1 entry out of 1000 keys, but had 0");
        }
    }
}
