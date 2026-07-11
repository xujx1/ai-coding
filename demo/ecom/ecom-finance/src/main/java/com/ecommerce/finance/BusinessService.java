package com.ecommerce.finance;

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
        attributes.put("settlementId", String.valueOf(input.getOrDefault("settlementId", "SETTLE-1001")));
        attributes.put("paymentId", String.valueOf(input.getOrDefault("paymentId", "PAY-1001")));
        attributes.put("merchantId", String.valueOf(input.getOrDefault("merchantId", "M-1001")));
        attributes.put("amountCent", ((Number) input.getOrDefault("amountCent", 8900L)).longValue());
        attributes.put("period", String.valueOf(input.getOrDefault("period", "2026-07")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("settlementId")), "RECORDED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> createReconciliationTask(String id) {
        return transition(id, "RECONCILING");
    }

    public Map<String, Object> createMerchantSettlement(String id) {
        return transition(id, "SETTLED");
    }

    public Map<String, Object> createInvoice(String id) {
        return transition(id, "INVOICED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("settlement not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("settlement not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
