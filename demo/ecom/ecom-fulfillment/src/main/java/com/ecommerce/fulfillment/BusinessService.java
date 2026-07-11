package com.ecommerce.fulfillment;

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
        attributes.put("fulfillmentId", String.valueOf(input.getOrDefault("fulfillmentId", "FUL-1001")));
        attributes.put("orderId", String.valueOf(input.getOrDefault("orderId", "ORD-1001")));
        attributes.put("warehouseId", String.valueOf(input.getOrDefault("warehouseId", "WH-01")));
        attributes.put("packageCount", ((Number) input.getOrDefault("packageCount", 1L)).intValue());
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("fulfillmentId")), "CREATED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> splitPackage(String id) {
        return transition(id, "SPLIT");
    }

    public Map<String, Object> shipPackage(String id) {
        return transition(id, "SHIPPED");
    }

    public Map<String, Object> markDelivered(String id) {
        return transition(id, "DELIVERED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("fulfillment not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("fulfillment not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
