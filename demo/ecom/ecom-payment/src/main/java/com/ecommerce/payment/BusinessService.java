package com.ecommerce.payment;

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
        attributes.put("paymentId", String.valueOf(input.getOrDefault("paymentId", "PAY-1001")));
        attributes.put("orderId", String.valueOf(input.getOrDefault("orderId", "ORD-1001")));
        attributes.put("amountCent", ((Number) input.getOrDefault("amountCent", 8900L)).longValue());
        attributes.put("channel", String.valueOf(input.getOrDefault("channel", "MOCK_PAY")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("paymentId")), "CREATED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> markPaid(String id) {
        return transition(id, "PAID");
    }

    public Map<String, Object> createRefundPayment(String id) {
        return transition(id, "REFUND_CREATED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("payment not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("payment not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
