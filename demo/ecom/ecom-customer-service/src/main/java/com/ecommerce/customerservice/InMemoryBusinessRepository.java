package com.ecommerce.customerservice;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class InMemoryBusinessRepository implements BusinessRepository {
    private final Map<String, BusinessRecord> records = new LinkedHashMap<>();

    @Override
    public void initialize() {
    }

    @Override
    public BusinessRecord save(BusinessRecord record) {
        records.put(record.id(), record);
        return record;
    }

    @Override
    public Optional<BusinessRecord> findById(String id) {
        return Optional.ofNullable(records.get(id));
    }

    @Override
    public List<BusinessRecord> list() {
        return new ArrayList<>(records.values());
    }
}
