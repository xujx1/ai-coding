package com.ecommerce.aftersales;

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
        attributes.put("caseId", String.valueOf(input.getOrDefault("caseId", "AS-1001")));
        attributes.put("orderId", String.valueOf(input.getOrDefault("orderId", "ORD-1001")));
        attributes.put("orderLineId", String.valueOf(input.getOrDefault("orderLineId", "LINE-1")));
        attributes.put("amountCent", ((Number) input.getOrDefault("amountCent", 8900L)).longValue());
        attributes.put("reason", String.valueOf(input.getOrDefault("reason", "size mismatch")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("caseId")), "CREATED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> approveCase(String id) {
        return transition(id, "APPROVED");
    }

    public Map<String, Object> rejectCase(String id) {
        return transition(id, "REJECTED");
    }

    public Map<String, Object> markReturned(String id) {
        return transition(id, "RETURNED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("case not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("case not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
