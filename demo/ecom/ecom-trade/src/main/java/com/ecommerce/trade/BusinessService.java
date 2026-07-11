package com.ecommerce.trade;

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
        attributes.put("orderId", String.valueOf(input.getOrDefault("orderId", "ORD-1001")));
        attributes.put("userId", String.valueOf(input.getOrDefault("userId", "U-1001")));
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("quantity", ((Number) input.getOrDefault("quantity", 1L)).intValue());
        attributes.put("payAmountCent", ((Number) input.getOrDefault("payAmountCent", 8900L)).longValue());
        attributes.put("promotionReservationId", String.valueOf(input.getOrDefault("promotionReservationId", "PROMO-R-1001")));
        attributes.put("stockReservationId", String.valueOf(input.getOrDefault("stockReservationId", "STOCK-R-1001")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("orderId")), "CREATED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> confirmPaid(String id) {
        return transition(id, "PAID");
    }

    public Map<String, Object> cancelOrder(String id) {
        return transition(id, "CANCELLED");
    }

    public Map<String, Object> completeOrder(String id) {
        return transition(id, "COMPLETED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("order not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("order not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
