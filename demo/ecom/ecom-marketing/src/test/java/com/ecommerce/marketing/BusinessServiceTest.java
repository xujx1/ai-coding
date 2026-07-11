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
    void requirementValidationStillUsesDomainKnowledge() {
        Map<String, Object> result = DomainService.validateRequirement("营销 优惠券 满减 秒杀 拼团 积分 活动");
        assertTrue(Boolean.TRUE.equals(result.get("impacted")));
        assertFalse(((java.util.List<?>) result.get("matchedKeywords")).isEmpty());
    }
}
