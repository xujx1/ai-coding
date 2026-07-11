package com.ecommerce.content;

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
        attributes.put("contentId", String.valueOf(input.getOrDefault("contentId", "CONT-1001")));
        attributes.put("authorUserId", String.valueOf(input.getOrDefault("authorUserId", "U-1001")));
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("title", String.valueOf(input.getOrDefault("title", "Demo Post")));
        attributes.put("body", String.valueOf(input.getOrDefault("body", "content body")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("contentId")), "DRAFT", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> bindProduct(String id) {
        return transition(id, "BOUND_PRODUCT");
    }

    public Map<String, Object> approveContent(String id) {
        return transition(id, "APPROVED");
    }

    public Map<String, Object> rejectContent(String id) {
        return transition(id, "REJECTED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("content not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("content not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
