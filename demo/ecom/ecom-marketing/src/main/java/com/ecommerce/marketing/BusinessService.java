package com.ecommerce.marketing;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public final class BusinessService {
    private final BusinessRepository repository;
    private final ProductGateway productGateway;
    private final InventoryGateway inventoryGateway;

    public BusinessService(BusinessRepository repository) {
        this(
                repository,
                new HttpProductGateway(System.getenv().getOrDefault("PRODUCT_BASE_URL", "http://127.0.0.1:4210")),
                new HttpInventoryGateway(System.getenv().getOrDefault("INVENTORY_BASE_URL", "http://127.0.0.1:4215"))
        );
    }

    public BusinessService(BusinessRepository repository, ProductGateway productGateway, InventoryGateway inventoryGateway) {
        this.repository = repository;
        this.productGateway = productGateway;
        this.inventoryGateway = inventoryGateway;
        this.repository.initialize();
    }

    public Map<String, Object> create(Map<String, Object> input) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("campaignId", String.valueOf(input.getOrDefault("campaignId", "CAMP-1001")));
        attributes.put("name", String.valueOf(input.getOrDefault("name", "Demo Coupon Campaign")));
        attributes.put("skuId", String.valueOf(input.getOrDefault("skuId", "SKU-1001")));
        attributes.put("discountCent", ((Number) input.getOrDefault("discountCent", 1000L)).longValue());
        attributes.put("quota", ((Number) input.getOrDefault("quota", 100L)).intValue());
        if (input.containsKey("protectedStock")) {
            int protectedStock = ((Number) input.getOrDefault("protectedStock", 0L)).intValue();
            if (protectedStock <= 0) throw new IllegalArgumentException("protectedStock must be positive");
            Map<String, Object> productCheck = requireSaleableSku(String.valueOf(attributes.get("skuId")));
            Map<String, Object> inventoryCheck = requireProtectableStock(String.valueOf(attributes.get("skuId")), protectedStock);
            attributes.put("protectedStock", protectedStock);
            attributes.put("productCheck", productCheck);
            attributes.put("inventoryCheck", inventoryCheck);
        }
        BusinessRecord record = new BusinessRecord(String.valueOf(attributes.get("campaignId")), "DRAFT", attributes);
        return repository.save(record).toMap();
    }

    public Map<String, Object> enableCampaign(String id) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("campaign not found: " + id));
        Map<String, Object> attributes = current.attributes();
        if (attributes.containsKey("protectedStock")) {
            String skuId = String.valueOf(attributes.get("skuId"));
            int protectedStock = ((Number) attributes.get("protectedStock")).intValue();
            attributes.put("productCheck", requireSaleableSku(skuId));
            attributes.put("protectionResult", inventoryGateway.protectCampaignStock(id, skuId, protectedStock));
        }
        return repository.save(new BusinessRecord(current.id(), "ENABLED", attributes)).toMap();
    }

    public Map<String, Object> disableCampaign(String id) {
        return transition(id, "DISABLED");
    }

    public Map<String, Object> reservePromotion(String id) {
        return transition(id, "RESERVED");
    }

    public Map<String, Object> confirmUse(String id) {
        return transition(id, "USED");
    }

    public Map<String, Object> cancelReservation(String id) {
        return transition(id, "CANCELLED");
    }

    public Map<String, Object> deleteCampaign(String id) {
        return repository.findById(id)
                .map(current -> {
                    Map<String, Object> attributes = current.attributes();
                    if (attributes.containsKey("protectedStock")) {
                        String skuId = String.valueOf(attributes.get("skuId"));
                        attributes.put("releaseResult", inventoryGateway.releaseCampaignStock(id, skuId));
                    }
                    if ("DELETED".equals(current.status())) {
                        Map<String, Object> result = new BusinessRecord(current.id(), "DELETED", attributes).toMap();
                        result.put("idempotent", true);
                        return result;
                    }
                    Map<String, Object> result = repository.save(new BusinessRecord(current.id(), "DELETED", attributes)).toMap();
                    result.put("idempotent", false);
                    return result;
                })
                .orElseGet(() -> {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("campaignId", id);
                    result.put("id", id);
                    result.put("status", "DELETED");
                    result.put("idempotent", true);
                    return result;
                });
    }

    public Map<String, Object> get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("campaign not found: " + id))
                .toMap();
    }

    public List<Map<String, Object>> list() {
        return repository.list().stream().map(BusinessRecord::toMap).toList();
    }

    private Map<String, Object> transition(String id, String status) {
        BusinessRecord current = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("campaign not found: " + id));
        BusinessRecord next = new BusinessRecord(current.id(), status, current.attributes());
        return repository.save(next).toMap();
    }

    private Map<String, Object> requireSaleableSku(String skuId) {
        Map<String, Object> sku = productGateway.getSku(skuId);
        if (sku.containsKey("error")) throw new IllegalArgumentException(String.valueOf(sku.get("error")));
        String status = String.valueOf(sku.getOrDefault("status", ""));
        boolean saleable = Boolean.TRUE.equals(sku.get("saleable"));
        if (!"SALEABLE".equals(status) || !saleable) {
            throw new IllegalArgumentException("sku is not saleable: " + skuId);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("skuId", String.valueOf(sku.getOrDefault("skuId", sku.getOrDefault("id", skuId))));
        result.put("status", status);
        result.put("saleable", saleable);
        result.put("priceCent", sku.getOrDefault("priceCent", 0));
        return result;
    }

    private Map<String, Object> requireProtectableStock(String skuId, int protectedStock) {
        Map<String, Object> available = inventoryGateway.queryAvailable(skuId);
        if (available.containsKey("error")) throw new IllegalArgumentException(String.valueOf(available.get("error")));
        int protectableQuantity = ((Number) available.getOrDefault("protectableQuantity", 0)).intValue();
        if (protectableQuantity < protectedStock) {
            throw new IllegalArgumentException("protectable stock is insufficient: " + protectableQuantity + " < " + protectedStock);
        }
        return available;
    }

    public interface ProductGateway {
        Map<String, Object> getSku(String skuId);
    }

    public interface InventoryGateway {
        Map<String, Object> queryAvailable(String skuId);

        Map<String, Object> protectCampaignStock(String campaignId, String skuId, int protectedStock);

        Map<String, Object> releaseCampaignStock(String campaignId, String skuId);
    }

    private static final class HttpProductGateway implements ProductGateway {
        private final String baseUrl;

        private HttpProductGateway(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        @Override
        public Map<String, Object> getSku(String skuId) {
            return HttpJsonClient.post(baseUrl + "/business/get", Map.of("skuId", skuId));
        }
    }

    private static final class HttpInventoryGateway implements InventoryGateway {
        private final String baseUrl;

        private HttpInventoryGateway(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        @Override
        public Map<String, Object> queryAvailable(String skuId) {
            return HttpJsonClient.post(baseUrl + "/business/query-available", Map.of("skuId", skuId));
        }

        @Override
        public Map<String, Object> protectCampaignStock(String campaignId, String skuId, int protectedStock) {
            return HttpJsonClient.post(baseUrl + "/business/protect-campaign-stock", Map.of(
                    "campaignId", campaignId,
                    "skuId", skuId,
                    "protectedStock", protectedStock
            ));
        }

        @Override
        public Map<String, Object> releaseCampaignStock(String campaignId, String skuId) {
            return HttpJsonClient.post(baseUrl + "/business/release-campaign-stock", Map.of("campaignId", campaignId, "skuId", skuId));
        }
    }

    private static final class HttpJsonClient {
        private static final HttpClient CLIENT = HttpClient.newHttpClient();

        private HttpJsonClient() {
        }

        private static Map<String, Object> post(String url, Map<String, Object> body) {
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                        .header("content-type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(JsonSupport.toJson(body)))
                        .build();
                HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
                Map<String, Object> parsed = RequestParser.parseFlatJson(response.body());
                if (response.statusCode() >= 400 && !parsed.containsKey("error")) {
                    parsed.put("error", "http " + response.statusCode());
                }
                return parsed;
            } catch (Exception error) {
                throw new IllegalStateException("Failed to call " + url, error);
            }
        }
    }
}
