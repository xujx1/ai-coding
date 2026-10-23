package com.ecommerce.inventory;

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
        attributes.put("stockId", String.valueOf(input.getOrDefault("stockId", "STOCK-1001")));
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("warehouseId", String.valueOf(input.getOrDefault("warehouseId", "WH-01")));
        attributes.put("quantity", ((Number) input.getOrDefault("quantity", 100L)).intValue());
        attributes.put("availableQuantity", ((Number) input.getOrDefault("availableQuantity", 100L)).intValue());
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("stockId")), "AVAILABLE", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> queryAvailable(Map<String, Object> input) {
        String skuId = String.valueOf(input.getOrDefault("skuId", input.getOrDefault("id", "")));
        int availableQuantity = repository.findBySkuId(skuId)
                .map(record -> ((Number) record.attributes().getOrDefault("availableQuantity", 0)).intValue())
                .orElse(0);
        int campaignProtectedQuantity = repository.listCampaignProtectionsBySkuId(skuId).stream()
                .filter(record -> "ACTIVE".equals(record.status()))
                .mapToInt(record -> ((Number) record.attributes().getOrDefault("protectedStock", 0)).intValue())
                .sum();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("skuId", skuId);
        result.put("availableQuantity", availableQuantity);
        result.put("campaignProtectedQuantity", campaignProtectedQuantity);
        result.put("protectableQuantity", Math.max(availableQuantity - campaignProtectedQuantity, 0));
        return result;
    }

    public Map<String, Object> protectCampaignStock(Map<String, Object> input) {
        String campaignId = String.valueOf(input.getOrDefault("campaignId", ""));
        String skuId = String.valueOf(input.getOrDefault("skuId", ""));
        int protectedStock = ((Number) input.getOrDefault("protectedStock", 0L)).intValue();
        if (campaignId.isBlank()) throw new IllegalArgumentException("campaignId is required");
        if (skuId.isBlank()) throw new IllegalArgumentException("skuId is required");
        if (protectedStock <= 0) throw new IllegalArgumentException("protectedStock must be positive");

        return repository.findCampaignProtection(campaignId, skuId)
                .map(existing -> protectExisting(input, existing, protectedStock))
                .orElseGet(() -> createProtection(input, campaignId, skuId, protectedStock));
    }

    public Map<String, Object> releaseCampaignStock(Map<String, Object> input) {
        String campaignId = String.valueOf(input.getOrDefault("campaignId", ""));
        String skuId = String.valueOf(input.getOrDefault("skuId", ""));
        if (campaignId.isBlank()) throw new IllegalArgumentException("campaignId is required");
        if (skuId.isBlank()) throw new IllegalArgumentException("skuId is required");

        return repository.findCampaignProtection(campaignId, skuId)
                .map(this::releaseExisting)
                .orElseGet(() -> {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("campaignId", campaignId);
                    result.put("skuId", skuId);
                    result.put("status", "RELEASED");
                    result.put("idempotent", true);
                    result.put("released", false);
                    return result;
                });
    }

    public Map<String, Object> reserveStock(String id) {
        return transition(id, "RESERVED");
    }

    public Map<String, Object> releaseReservation(String id) {
        return transition(id, "RELEASED");
    }

    public Map<String, Object> deductReservation(String id) {
        return transition(id, "DEDUCTED");
    }

    public Map<String, Object> returnStock(String id) {
        return transition(id, "RETURNED");
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("stock not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("stock not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }

    private Map<String, Object> protectExisting(Map<String, Object> input, BusinessRecord existing, int protectedStock) {
        int existingStock = ((Number) existing.attributes().getOrDefault("protectedStock", 0)).intValue();
        if ("ACTIVE".equals(existing.status()) && existingStock == protectedStock) {
            Map<String, Object> result = existing.toMap();
            result.put("idempotent", true);
            return result;
        }
        if ("ACTIVE".equals(existing.status())) {
            throw new IllegalArgumentException("campaign stock protection already exists with different quantity");
        }
        ensureProtectable(String.valueOf(input.get("skuId")), protectedStock);
        Map<String, Object> attributes = existing.attributes();
        attributes.put("protectedStock", protectedStock);
        BusinessRecord reactivated = new BusinessRecord(existing.id(), "ACTIVE", attributes);
        Map<String, Object> result = repository.saveCampaignProtection(reactivated).toMap();
        result.put("idempotent", false);
        return result;
    }

    private Map<String, Object> createProtection(Map<String, Object> input, String campaignId, String skuId, int protectedStock) {
        ensureProtectable(skuId, protectedStock);
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("campaignId", campaignId);
        attributes.put("skuId", skuId);
        attributes.put("protectedStock", protectedStock);
        BusinessRecord record = new BusinessRecord(campaignId + ":" + skuId, "ACTIVE", attributes);
        Map<String, Object> result = repository.saveCampaignProtection(record).toMap();
        result.put("idempotent", false);
        return result;
    }

    private Map<String, Object> releaseExisting(BusinessRecord existing) {
        if ("RELEASED".equals(existing.status())) {
            Map<String, Object> result = existing.toMap();
            result.put("idempotent", true);
            result.put("released", false);
            return result;
        }
        BusinessRecord released = new BusinessRecord(existing.id(), "RELEASED", existing.attributes());
        Map<String, Object> result = repository.saveCampaignProtection(released).toMap();
        result.put("idempotent", false);
        result.put("released", true);
        return result;
    }

    private void ensureProtectable(String skuId, int protectedStock) {
        int protectableQuantity = ((Number) queryAvailable(Map.of("skuId", skuId)).get("protectableQuantity")).intValue();
        if (protectableQuantity < protectedStock) {
            throw new IllegalArgumentException("protectable stock is insufficient: " + protectableQuantity + " < " + protectedStock);
        }
    }
}
