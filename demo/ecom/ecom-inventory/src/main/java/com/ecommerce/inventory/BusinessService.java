package com.ecommerce.inventory;

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
        attributes.put("stockId", String.valueOf(input.getOrDefault("stockId", "STOCK-1001")));
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("warehouseId", String.valueOf(input.getOrDefault("warehouseId", "WH-01")));
        attributes.put("quantity", ((Number) input.getOrDefault("quantity", 100L)).intValue());
        attributes.put("availableQuantity", ((Number) input.getOrDefault("availableQuantity", 100L)).intValue());
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("stockId")), "AVAILABLE", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> reserveStock(String id) {
        return transition(id, "RESERVED");
    }

    public Map<String, Object> releaseReservation(String id) {
        return transition(id, "RELEASED");
    }

    public Map<String, Object> deductReservation(String id) {
        return transition(id, "DEDUCTED");
    }

    public Map<String, Object> returnStock(String id) {
        return transition(id, "RETURNED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("stock not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("stock not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
