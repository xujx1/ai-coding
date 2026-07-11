package com.ecommerce.user;

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
        attributes.put("userId", String.valueOf(input.getOrDefault("userId", "U-1001")));
        attributes.put("mobile", String.valueOf(input.getOrDefault("mobile", "13800000000")));
        attributes.put("memberLevel", String.valueOf(input.getOrDefault("memberLevel", "NORMAL")));
        attributes.put("address", String.valueOf(input.getOrDefault("address", "Shanghai")));
        attributes.put("tags", String.valueOf(input.getOrDefault("tags", "new,buyer")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("userId")), "ACTIVE", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> addAddress(String id) {
        return transition(id, "ADDRESS_READY");
    }

    public Map<String, Object> upgradeMember(String id) {
        return transition(id, "VIP");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("user not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("user not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
