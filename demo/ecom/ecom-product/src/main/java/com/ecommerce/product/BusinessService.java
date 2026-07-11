package com.ecommerce.product;

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
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("spuId", String.valueOf(input.getOrDefault("spuId", "SPU-1001")));
        attributes.put("title", String.valueOf(input.getOrDefault("title", "Demo SKU")));
        attributes.put("categoryId", String.valueOf(input.getOrDefault("categoryId", "CAT-01")));
        attributes.put("brandId", String.valueOf(input.getOrDefault("brandId", "BR-01")));
        attributes.put("priceCent", ((Number) input.getOrDefault("priceCent", 9900L)).longValue());
        attributes.put("saleable", Boolean.TRUE.equals(input.getOrDefault("saleable", true)));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("skuId")), "CREATED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> enableSale(String id) {
        return transition(id, "SALEABLE");
    }

    public Map<String, Object> disableSale(String id) {
        return transition(id, "OFF_SHELF");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("sku not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("sku not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
