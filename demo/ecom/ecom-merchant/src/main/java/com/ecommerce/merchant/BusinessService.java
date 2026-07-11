package com.ecommerce.merchant;

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
        attributes.put("merchantId", String.valueOf(input.getOrDefault("merchantId", "M-1001")));
        attributes.put("shopId", String.valueOf(input.getOrDefault("shopId", "SHOP-1001")));
        attributes.put("merchantName", String.valueOf(input.getOrDefault("merchantName", "Demo Merchant")));
        attributes.put("qualificationNo", String.valueOf(input.getOrDefault("qualificationNo", "Q-1001")));
        attributes.put("shopName", String.valueOf(input.getOrDefault("shopName", "Demo Shop")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("merchantId")), "PENDING_AUDIT", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> approveMerchant(String id) {
        return transition(id, "APPROVED");
    }

    public Map<String, Object> disableShop(String id) {
        return transition(id, "DISABLED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("merchant not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("merchant not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
