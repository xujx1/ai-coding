package com.ecommerce.marketing;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BusinessServiceTest {
    @Test
    void createAndQueryBusinessRecord() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        Map<String, Object> created = service.create(Map.of("campaignId", "TEST-1"));
        assertEquals("TEST-1", created.get("id"));
        assertEquals("DRAFT", created.get("status"));
        assertEquals(1, service.list().size());
    }

    @Test
    void transitionUpdatesStatus() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("campaignId", "TEST-2"));
        Map<String, Object> changed = service.enableCampaign("TEST-2");
        assertEquals("ENABLED", changed.get("status"));
    }

    @Test
    void deleteCampaignMarksDeleted() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("campaignId", "TEST-DELETE"));
        Map<String, Object> changed = service.deleteCampaign("TEST-DELETE");
        assertEquals("DELETED", changed.get("status"));
    }

    @Test
    void createStockGuardCampaignValidatesProductAndInventoryWithoutProtectingStock() {
        FakeInventoryGateway inventory = new FakeInventoryGateway(100);
        BusinessService service = new BusinessService(new InMemoryBusinessRepository(), saleableProduct(), inventory);

        Map<String, Object> created = service.create(Map.of(
                "campaignId", "CAMP-GUARD-1",
                "skuId", "SKU-GUARD-1",
                "protectedStock", 30
        ));

        assertEquals("DRAFT", created.get("status"));
        assertEquals(30, created.get("protectedStock"));
        assertEquals(1, inventory.queryCount);
        assertEquals(0, inventory.protectCount);
    }

    @Test
    void createStockGuardCampaignFailsWhenSkuIsOffShelf() {
        BusinessService service = new BusinessService(
                new InMemoryBusinessRepository(),
                skuId -> Map.of("skuId", skuId, "status", "OFF_SHELF", "saleable", false),
                new FakeInventoryGateway(100)
        );

        IllegalArgumentException error = org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.create(Map.of("campaignId", "CAMP-OFF", "skuId", "SKU-OFF", "protectedStock", 10)));

        assertTrue(error.getMessage().contains("not saleable"));
    }

    @Test
    void createStockGuardCampaignFailsWhenInventoryIsInsufficient() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository(), saleableProduct(), new FakeInventoryGateway(5));

        IllegalArgumentException error = org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.create(Map.of("campaignId", "CAMP-LOW", "skuId", "SKU-LOW", "protectedStock", 10)));

        assertTrue(error.getMessage().contains("insufficient"));
    }

    @Test
    void enableStockGuardCampaignProtectsInventoryIdempotently() {
        FakeInventoryGateway inventory = new FakeInventoryGateway(100);
        BusinessService service = new BusinessService(new InMemoryBusinessRepository(), saleableProduct(), inventory);
        service.create(Map.of("campaignId", "CAMP-ENABLE", "skuId", "SKU-GUARD-2", "protectedStock", 20));

        Map<String, Object> enabled = service.enableCampaign("CAMP-ENABLE");
        Map<String, Object> enabledAgain = service.enableCampaign("CAMP-ENABLE");

        assertEquals("ENABLED", enabled.get("status"));
        assertEquals("ENABLED", enabledAgain.get("status"));
        assertEquals(2, inventory.protectCount);
    }

    @Test
    void deleteStockGuardCampaignReleasesInventoryAndRepeatedDeleteSucceeds() {
        FakeInventoryGateway inventory = new FakeInventoryGateway(100);
        BusinessService service = new BusinessService(new InMemoryBusinessRepository(), saleableProduct(), inventory);
        service.create(Map.of("campaignId", "CAMP-DELETE", "skuId", "SKU-GUARD-3", "protectedStock", 20));
        service.enableCampaign("CAMP-DELETE");

        Map<String, Object> deleted = service.deleteCampaign("CAMP-DELETE");
        Map<String, Object> deletedAgain = service.deleteCampaign("CAMP-DELETE");

        assertEquals("DELETED", deleted.get("status"));
        assertEquals(false, deleted.get("idempotent"));
        assertEquals(true, deletedAgain.get("idempotent"));
        assertEquals(2, inventory.releaseCount);
    }

    @Test
    void requirementValidationStillUsesDomainKnowledge() {
        Map<String, Object> result = DomainService.validateRequirement("营销 优惠券 满减 秒杀 拼团 积分 活动");
        assertTrue(Boolean.TRUE.equals(result.get("impacted")));
        assertFalse(((java.util.List<?>) result.get("matchedKeywords")).isEmpty());
    }

    private static BusinessService.ProductGateway saleableProduct() {
        return skuId -> Map.of("skuId", skuId, "status", "SALEABLE", "saleable", true, "priceCent", 9900L);
    }

    private static final class FakeInventoryGateway implements BusinessService.InventoryGateway {
        private final int protectableQuantity;
        private int queryCount;
        private int protectCount;
        private int releaseCount;

        private FakeInventoryGateway(int protectableQuantity) {
            this.protectableQuantity = protectableQuantity;
        }

        @Override
        public Map<String, Object> queryAvailable(String skuId) {
            queryCount++;
            return Map.of(
                    "skuId", skuId,
                    "availableQuantity", protectableQuantity,
                    "campaignProtectedQuantity", 0,
                    "protectableQuantity", protectableQuantity
            );
        }

        @Override
        public Map<String, Object> protectCampaignStock(String campaignId, String skuId, int protectedStock) {
            protectCount++;
            return Map.of("campaignId", campaignId, "skuId", skuId, "protectedStock", protectedStock, "status", "ACTIVE", "idempotent", protectCount > 1);
        }

        @Override
        public Map<String, Object> releaseCampaignStock(String campaignId, String skuId) {
            releaseCount++;
            return Map.of("campaignId", campaignId, "skuId", skuId, "status", "RELEASED", "idempotent", releaseCount > 1);
        }
    }
}
