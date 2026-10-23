package com.ecommerce.inventory;

import java.util.List;
import java.util.Optional;

public interface BusinessRepository {
    void initialize();

    BusinessRecord save(BusinessRecord record);

    Optional<BusinessRecord> findById(String id);

    List<BusinessRecord> list();

    default Optional<BusinessRecord> findBySkuId(String skuId) {
        return list().stream()
                .filter(record -> skuId.equals(String.valueOf(record.attributes().get("skuId"))))
                .findFirst();
    }

    BusinessRecord saveCampaignProtection(BusinessRecord record);

    Optional<BusinessRecord> findCampaignProtection(String campaignId, String skuId);

    List<BusinessRecord> listCampaignProtectionsBySkuId(String skuId);
}
