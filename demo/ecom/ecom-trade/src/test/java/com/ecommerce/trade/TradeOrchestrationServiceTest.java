package com.ecommerce.trade;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TradeOrchestrationServiceTest {
    @Test
    void demoCancelReleasesMarketingAndInventory() {
        BusinessService trade = new BusinessService(new InMemoryBusinessRepository());
        FakeRemoteDomainClient remote = new FakeRemoteDomainClient();
        TradeOrchestrationService service = new TradeOrchestrationService(trade, remote);

        Map<String, Object> result = service.demoCancel(Map.of("orderId", "ORD-T"));

        assertEquals("demo-cancel", result.get("scenario"));
        assertEquals("CANCELLED", trade.get("ORD-T").get("status"));
        assertEquals("CANCELLED", remote.status("marketing", "CAMP-CANCEL-1"));
        assertEquals("RELEASED", remote.status("inventory", "STOCK-CANCEL-1"));
    }

    @Test
    void demoFullChainTouchesAllDomains() {
        BusinessService trade = new BusinessService(new InMemoryBusinessRepository());
        FakeRemoteDomainClient remote = new FakeRemoteDomainClient();
        TradeOrchestrationService service = new TradeOrchestrationService(trade, remote);

        Map<String, Object> result = service.demoFullChain(Map.of("orderId", "ORD-F"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) result.get("steps");

        assertEquals("demo-full-chain", result.get("scenario"));
        assertTrue(steps.stream().anyMatch(step -> String.valueOf(step.get("name")).startsWith("finance.")));
        assertTrue(steps.stream().anyMatch(step -> String.valueOf(step.get("name")).startsWith("customer-service.")));
        assertTrue(steps.stream().anyMatch(step -> String.valueOf(step.get("name")).startsWith("supply-chain.")));
    }

    private static final class FakeRemoteDomainClient extends RemoteDomainClient {
        private final Map<String, Map<String, Map<String, Object>>> records = new LinkedHashMap<>();

        private FakeRemoteDomainClient() {
            super(false);
        }

        @Override
        public Map<String, Object> create(String domain, Map<String, Object> input) {
            String id = inferId(domain, input);
            Map<String, Object> record = new LinkedHashMap<>(input);
            record.put("id", id);
            record.put("status", initialStatus(domain));
            records.computeIfAbsent(domain, ignored -> new LinkedHashMap<>()).put(id, record);
            return record;
        }

        @Override
        public Map<String, Object> transition(String domain, String action, String id) {
            Map<String, Object> record = records.computeIfAbsent(domain, ignored -> new LinkedHashMap<>())
                    .computeIfAbsent(id, ignored -> new LinkedHashMap<>(Map.of("id", id)));
            record.put("status", statusFor(action));
            return record;
        }

        String status(String domain, String id) {
            return String.valueOf(records.get(domain).get(id).get("status"));
        }

        private static String inferId(String domain, Map<String, Object> input) {
            for (String key : List.of("skuId", "userId", "campaignId", "stockId", "paymentId", "fulfillmentId", "waybillNo", "merchantId", "contentId", "settlementId", "purchaseOrderId", "caseId", "ticketId")) {
                if (input.containsKey(key)) return String.valueOf(input.get(key));
            }
            return domain + "-id";
        }

        private static String initialStatus(String domain) {
            return switch (domain) {
                case "marketing", "content" -> "DRAFT";
                case "inventory" -> "AVAILABLE";
                case "merchant" -> "PENDING_AUDIT";
                case "customer-service" -> "OPEN";
                case "finance" -> "RECORDED";
                case "user" -> "ACTIVE";
                default -> "CREATED";
            };
        }

        private static String statusFor(String action) {
            return switch (action) {
                case "enable-campaign" -> "ENABLED";
                case "reserve-promotion", "reserve-stock" -> "RESERVED";
                case "confirm-use" -> "USED";
                case "cancel-reservation", "cancel-order" -> "CANCELLED";
                case "release-reservation" -> "RELEASED";
                case "deduct-reservation" -> "DEDUCTED";
                case "mark-paid", "confirm-paid" -> "PAID";
                case "complete-order" -> "COMPLETED";
                case "split-package" -> "SPLIT";
                case "ship-package" -> "SHIPPED";
                case "mark-delivered" -> "DELIVERED";
                case "mark-signed" -> "SIGNED";
                case "approve-merchant" -> "APPROVED";
                case "approve-content" -> "APPROVED";
                case "create-merchant-settlement" -> "SETTLED";
                case "approve-quality-check" -> "QUALITY_APPROVED";
                case "approve-case" -> "APPROVED";
                case "resolve-ticket" -> "RESOLVED";
                default -> "UPDATED";
            };
        }
    }
}
