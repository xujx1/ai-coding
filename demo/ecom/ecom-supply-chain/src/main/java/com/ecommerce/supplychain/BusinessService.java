package com.ecommerce.supplychain;

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
        attributes.put("purchaseOrderId", String.valueOf(input.getOrDefault("purchaseOrderId", "PO-1001")));
        attributes.put("supplierId", String.valueOf(input.getOrDefault("supplierId", "SUP-1001")));
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("quantity", ((Number) input.getOrDefault("quantity", 200L)).intValue());
        attributes.put("qualityCheckId", String.valueOf(input.getOrDefault("qualityCheckId", "QC-1001")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("purchaseOrderId")), "CREATED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> approveQualityCheck(String id) {
        return transition(id, "QUALITY_APPROVED");
    }

    public Map<String, Object> rejectQualityCheck(String id) {
        return transition(id, "QUALITY_REJECTED");
    }

    public Map<String, Object> createReplenishmentPlan(String id) {
        return transition(id, "REPLENISHMENT_PLANNED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("purchase not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("purchase not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
