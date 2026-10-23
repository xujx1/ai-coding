package com.ecommerce.inventory;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BusinessServiceTest {
    @Test
    void createAndQueryBusinessRecord() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        Map<String, Object> created = service.create(Map.of("stockId", "TEST-1"));
        assertEquals("TEST-1", created.get("id"));
        assertEquals("AVAILABLE", created.get("status"));
        assertEquals(1, service.list().size());
    }

    @Test
    void transitionUpdatesStatus() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("stockId", "TEST-2"));
        Map<String, Object> changed = service.reserveStock("TEST-2");
        assertEquals("RESERVED", changed.get("status"));
    }

    @Test
    void queryAvailableSubtractsActiveCampaignProtections() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("stockId", "STOCK-GUARD-1", "skuId", "SKU-GUARD-1", "availableQuantity", 100));
        service.protectCampaignStock(Map.of("campaignId", "CAMP-1", "skuId", "SKU-GUARD-1", "protectedStock", 30));

        Map<String, Object> available = service.queryAvailable(Map.of("skuId", "SKU-GUARD-1"));

        assertEquals(100, available.get("availableQuantity"));
        assertEquals(30, available.get("campaignProtectedQuantity"));
        assertEquals(70, available.get("protectableQuantity"));
    }

    @Test
    void protectCampaignStockIsIdempotentForSameCampaignAndSku() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("stockId", "STOCK-GUARD-2", "skuId", "SKU-GUARD-2", "availableQuantity", 50));

        Map<String, Object> first = service.protectCampaignStock(Map.of("campaignId", "CAMP-2", "skuId", "SKU-GUARD-2", "protectedStock", 20));
        Map<String, Object> second = service.protectCampaignStock(Map.of("campaignId", "CAMP-2", "skuId", "SKU-GUARD-2", "protectedStock", 20));
        Map<String, Object> available = service.queryAvailable(Map.of("skuId", "SKU-GUARD-2"));

        assertEquals("ACTIVE", first.get("status"));
        assertEquals(false, first.get("idempotent"));
        assertEquals(true, second.get("idempotent"));
        assertEquals(30, available.get("protectableQuantity"));
    }

    @Test
    void releaseCampaignStockTreatsMissingAndRepeatedReleaseAsSuccess() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("stockId", "STOCK-GUARD-3", "skuId", "SKU-GUARD-3", "availableQuantity", 50));

        Map<String, Object> missing = service.releaseCampaignStock(Map.of("campaignId", "CAMP-MISSING", "skuId", "SKU-GUARD-3"));
        service.protectCampaignStock(Map.of("campaignId", "CAMP-3", "skuId", "SKU-GUARD-3", "protectedStock", 20));
        Map<String, Object> firstRelease = service.releaseCampaignStock(Map.of("campaignId", "CAMP-3", "skuId", "SKU-GUARD-3"));
        Map<String, Object> secondRelease = service.releaseCampaignStock(Map.of("campaignId", "CAMP-3", "skuId", "SKU-GUARD-3"));
        Map<String, Object> available = service.queryAvailable(Map.of("skuId", "SKU-GUARD-3"));

        assertEquals(true, missing.get("idempotent"));
        assertEquals(false, firstRelease.get("idempotent"));
        assertEquals(true, secondRelease.get("idempotent"));
        assertEquals(50, available.get("protectableQuantity"));
    }

    @Test
    void protectCampaignStockFailsWhenProtectableQuantityIsInsufficient() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("stockId", "STOCK-GUARD-4", "skuId", "SKU-GUARD-4", "availableQuantity", 5));

        IllegalArgumentException error = org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.protectCampaignStock(Map.of("campaignId", "CAMP-4", "skuId", "SKU-GUARD-4", "protectedStock", 6)));

        assertTrue(error.getMessage().contains("insufficient"));
    }

    @Test
    void requirementValidationStillUsesDomainKnowledge() {
        Map<String, Object> result = DomainService.validateRequirement("库存 实物库存 可用库存 预占 释放 多仓");
        assertTrue(Boolean.TRUE.equals(result.get("impacted")));
        assertFalse(((java.util.List<?>) result.get("matchedKeywords")).isEmpty());
    }
}
