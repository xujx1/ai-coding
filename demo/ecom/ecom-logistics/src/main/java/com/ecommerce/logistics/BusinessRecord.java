package com.ecommerce.logistics;

import java.util.LinkedHashMap;
import java.util.Map;

public final class BusinessRecord {
    private final String id;
    private final String status;
    private final Map<String, Object> attributes;

    public BusinessRecord(String id, String status, Map<String, Object> attributes) {
        this.id = id;
        this.status = status;
        this.attributes = new LinkedHashMap<>(attributes);
    }

    public String id() {
        return id;
    }

    public String status() {
        return status;
    }

    public Map<String, Object> attributes() {
        return new LinkedHashMap<>(attributes);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> result = new LinkedHashMap<>(attributes);
        result.put("id", id);
        result.put("status", status);
        return result;
    }
}
