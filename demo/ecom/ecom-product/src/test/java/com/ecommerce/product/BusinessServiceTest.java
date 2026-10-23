package com.ecommerce.product;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BusinessServiceTest {
    @Test
    void createAndQueryBusinessRecord() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        Map<String, Object> created = service.create(Map.of("skuId", "TEST-1"));
        assertEquals("TEST-1", created.get("id"));
        assertEquals("CREATED", created.get("status"));
        assertEquals(1, service.list().size());
    }

    @Test
    void transitionUpdatesStatus() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("skuId", "TEST-2"));
        Map<String, Object> changed = service.enableSale("TEST-2");
        assertEquals("SALEABLE", changed.get("status"));
    }

    @Test
    void disableSaleMarksSkuOffShelfButKeepsSkuFacts() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("skuId", "TEST-OFF", "priceCent", 12900L, "saleable", true));

        Map<String, Object> changed = service.disableSale("TEST-OFF");

        assertEquals("OFF_SHELF", changed.get("status"));
        assertEquals("TEST-OFF", changed.get("skuId"));
        assertEquals(12900L, changed.get("priceCent"));
        assertEquals(true, changed.get("saleable"));
    }

    @Test
    void requirementValidationStillUsesDomainKnowledge() {
        Map<String, Object> result = DomainService.validateRequirement("商品 SPU SKU 类目 属性 品牌 素材 价格");
        assertTrue(Boolean.TRUE.equals(result.get("impacted")));
        assertFalse(((java.util.List<?>) result.get("matchedKeywords")).isEmpty());
    }
}
