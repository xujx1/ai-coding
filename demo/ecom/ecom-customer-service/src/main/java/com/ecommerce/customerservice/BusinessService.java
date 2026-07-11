package com.ecommerce.customerservice;

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
        attributes.put("ticketId", String.valueOf(input.getOrDefault("ticketId", "TICKET-1001")));
        attributes.put("userId", String.valueOf(input.getOrDefault("userId", "U-1001")));
        attributes.put("type", String.valueOf(input.getOrDefault("type", "ORDER")));
        attributes.put("bizRef", String.valueOf(input.getOrDefault("bizRef", "ORD-1001")));
        attributes.put("description", String.valueOf(input.getOrDefault("description", "Where is my package?")));
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("ticketId")), "OPEN", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> assignTicket(String id) {
        return transition(id, "ASSIGNED");
    }

    public Map<String, Object> resolveTicket(String id) {
        return transition(id, "RESOLVED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("ticket not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("ticket not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }
}
