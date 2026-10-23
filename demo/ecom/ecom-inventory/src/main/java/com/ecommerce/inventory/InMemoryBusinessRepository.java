package com.ecommerce.inventory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class InMemoryBusinessRepository implements BusinessRepository {
    private final Map<String, BusinessRecord> records = new LinkedHashMap<>();
    private final Map<String, BusinessRecord> campaignProtections = new LinkedHashMap<>();

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

    @Override
    public BusinessRecord saveCampaignProtection(BusinessRecord record) {
        campaignProtections.put(record.id(), record);
        return record;
    }

    @Override
    public Optional<BusinessRecord> findCampaignProtection(String campaignId, String skuId) {
        return Optional.ofNullable(campaignProtections.get(campaignId + ":" + skuId));
    }

    @Override
    public List<BusinessRecord> listCampaignProtectionsBySkuId(String skuId) {
        return campaignProtections.values().stream()
                .filter(record -> skuId.equals(String.valueOf(record.attributes().get("skuId"))))
                .toList();
    }
}
