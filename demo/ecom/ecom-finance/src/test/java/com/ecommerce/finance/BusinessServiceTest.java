package com.ecommerce.finance;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BusinessServiceTest {
    @Test
    void createAndQueryBusinessRecord() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        Map<String, Object> created = service.create(Map.of("settlementId", "TEST-1"));
        assertEquals("TEST-1", created.get("id"));
        assertEquals("RECORDED", created.get("status"));
        assertEquals(1, service.list().size());
    }

    @Test
    void transitionUpdatesStatus() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("settlementId", "TEST-2"));
        Map<String, Object> changed = service.createReconciliationTask("TEST-2");
        assertEquals("RECONCILING", changed.get("status"));
    }

    @Test
    void requirementValidationStillUsesDomainKnowledge() {
        Map<String, Object> result = DomainService.validateRequirement("财务 结算 对账 分润 发票 税务");
        assertTrue(Boolean.TRUE.equals(result.get("impacted")));
        assertFalse(((java.util.List<?>) result.get("matchedKeywords")).isEmpty());
    }
}
