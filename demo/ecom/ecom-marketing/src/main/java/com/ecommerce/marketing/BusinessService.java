package com.ecommerce.marketing;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class BusinessService {
    private final BusinessRepository repository;

    public BusinessService(BusinessRepository repository) {
        this.repository = repository;
        this.repository.initialize();
    }

    public Map<String, Object> create(Map<String, Object> input) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("campaignId", String.valueOf(input.getOrDefault("campaignId", "CAMP-1001")));
        attributes.put("name", String.valueOf(input.getOrDefault("name", "Demo Coupon Campaign")));
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("discountCent", ((Number) input.getOrDefault("discountCent", 1000L)).longValue());
        attributes.put("quota", ((Number) input.getOrDefault("quota", 100L)).intValue());
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("campaignId")), "DRAFT", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> enableCampaign(String id) {
        return transition(id, "ENABLED");
    }

    public Map<String, Object> disableCampaign(String id) {
        return transition(id, "DISABLED");
    }

    public Map<String, Object> reservePromotion(String id) {
        return transition(id, "RESERVED");
    }

    public Map<String, Object> confirmUse(String id) {
        return transition(id, "USED");
    }

    public Map<String, Object> cancelReservation(String id) {
        return transition(id, "CANCELLED");
    }

    public Map<String, Object> deleteCampaign(String id) {
        return transition(id, "DELETED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("campaign not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("campaign not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
