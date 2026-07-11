package com.ecommerce.logistics;

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
        attributes.put("waybillNo", String.valueOf(input.getOrDefault("waybillNo", "WB-1001")));
        attributes.put("packageId", String.valueOf(input.getOrDefault("packageId", "PKG-1001")));
        attributes.put("carrier", String.valueOf(input.getOrDefault("carrier", "MOCK_EXPRESS")));
        attributes.put("address", String.valueOf(input.getOrDefault("address", "Shanghai")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("waybillNo")), "CREATED", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> markPickedUp(String id) {
        return transition(id, "PICKED_UP");
    }

    public Map<String, Object> markInTransit(String id) {
        return transition(id, "IN_TRANSIT");
    }

    public Map<String, Object> markSigned(String id) {
        return transition(id, "SIGNED");
    }

    public Map<String, Object> reportException(String id) {
        return transition(id, "EXCEPTION");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("waybill not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("waybill not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
