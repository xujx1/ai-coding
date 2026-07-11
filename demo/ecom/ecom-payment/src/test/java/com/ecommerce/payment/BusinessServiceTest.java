package com.ecommerce.payment;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BusinessServiceTest {
    @Test
    void createAndQueryBusinessRecord() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        Map<String, Object> created = service.create(Map.of("paymentId", "TEST-1"));
        assertEquals("TEST-1", created.get("id"));
        assertEquals("CREATED", created.get("status"));
        assertEquals(1, service.list().size());
    }

    @Test
    void transitionUpdatesStatus() {
        BusinessService service = new BusinessService(new InMemoryBusinessRepository());
        service.create(Map.of("paymentId", "TEST-2"));
        Map<String, Object> changed = service.markPaid("TEST-2");
        assertEquals("PAID", changed.get("status"));
    }

    @Test
    void requirementValidationStillUsesDomainKnowledge() {
        Map<String, Object> result = DomainService.validateRequirement("支付 收银台 支付单 回调 退款支付 支付渠道");
        assertTrue(Boolean.TRUE.equals(result.get("impacted")));
        assertFalse(((java.util.List<?>) result.get("matchedKeywords")).isEmpty());
    }
}
