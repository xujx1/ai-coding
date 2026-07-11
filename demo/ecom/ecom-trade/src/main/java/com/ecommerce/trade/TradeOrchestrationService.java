package com.ecommerce.trade;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class TradeOrchestrationService {
    private final BusinessService tradeService;
    private final RemoteDomainClient remote;

    public TradeOrchestrationService(BusinessService tradeService, RemoteDomainClient remote) {
        this.tradeService = tradeService;
        this.remote = remote;
    }

    public Map<String, Object> demoCheckout(Map<String, Object> input) {
        String orderId = value(input, "orderId", "ORD-DEMO-1");
        String skuId = value(input, "skuId", "SKU-DEMO-1");
        String userId = value(input, "userId", "U-DEMO-1");
        String campaignId = value(input, "campaignId", "CAMP-DEMO-1");
        String stockId = value(input, "stockId", "STOCK-DEMO-1");
        String paymentId = value(input, "paymentId", "PAY-DEMO-1");
        String fulfillmentId = value(input, "fulfillmentId", "FUL-DEMO-1");
        String waybillNo = value(input, "waybillNo", "WB-DEMO-1");

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(step("product.create", remote.create("product", Map.of("skuId", skuId, "title", "Dubbo Demo SKU"))));
        steps.add(step("user.create", remote.create("user", Map.of("userId", userId, "address", "Shanghai"))));
        steps.add(step("marketing.create", remote.create("marketing", Map.of("campaignId", campaignId, "skuId", skuId, "discountCent", 1000L, "quota", 100))));
        steps.add(step("marketing.enable", remote.transition("marketing", "enable-campaign", campaignId)));
        steps.add(step("inventory.set", remote.create("inventory", Map.of("stockId", stockId, "skuId", skuId, "quantity", 100, "availableQuantity", 100))));
        steps.add(step("marketing.reserve", remote.transition("marketing", "reserve-promotion", campaignId)));
        steps.add(step("inventory.reserve", remote.transition("inventory", "reserve-stock", stockId)));
        steps.add(step("trade.create", tradeService.create(Map.of(
                "orderId", orderId,
                "userId", userId,
                "skuId", skuId,
                "quantity", 1,
                "payAmountCent", 8900L,
                "promotionReservationId", campaignId,
                "stockReservationId", stockId
        ))));
        steps.add(step("payment.create", remote.create("payment", Map.of("paymentId", paymentId, "orderId", orderId, "amountCent", 8900L))));
        steps.add(step("payment.paid", remote.transition("payment", "mark-paid", paymentId)));
        steps.add(step("trade.paid", tradeService.confirmPaid(orderId)));
        steps.add(step("marketing.confirm-use", remote.transition("marketing", "confirm-use", campaignId)));
        steps.add(step("inventory.deduct", remote.transition("inventory", "deduct-reservation", stockId)));
        steps.add(step("fulfillment.create", remote.create("fulfillment", Map.of("fulfillmentId", fulfillmentId, "orderId", orderId, "warehouseId", "WH-01"))));
        steps.add(step("fulfillment.split", remote.transition("fulfillment", "split-package", fulfillmentId)));
        steps.add(step("fulfillment.ship", remote.transition("fulfillment", "ship-package", fulfillmentId)));
        steps.add(step("logistics.create", remote.create("logistics", Map.of("waybillNo", waybillNo, "packageId", fulfillmentId, "address", "Shanghai"))));
        steps.add(step("logistics.signed", remote.transition("logistics", "mark-signed", waybillNo)));
        steps.add(step("fulfillment.delivered", remote.transition("fulfillment", "mark-delivered", fulfillmentId)));
        steps.add(step("trade.completed", tradeService.completeOrder(orderId)));
        return result("demo-checkout", orderId, steps);
    }

    public Map<String, Object> demoCancel(Map<String, Object> input) {
        String orderId = value(input, "orderId", "ORD-CANCEL-1");
        String campaignId = value(input, "campaignId", "CAMP-CANCEL-1");
        String stockId = value(input, "stockId", "STOCK-CANCEL-1");
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(step("marketing.create", remote.create("marketing", Map.of("campaignId", campaignId))));
        steps.add(step("marketing.enable", remote.transition("marketing", "enable-campaign", campaignId)));
        steps.add(step("marketing.reserve", remote.transition("marketing", "reserve-promotion", campaignId)));
        steps.add(step("inventory.set", remote.create("inventory", Map.of("stockId", stockId))));
        steps.add(step("inventory.reserve", remote.transition("inventory", "reserve-stock", stockId)));
        steps.add(step("trade.create", tradeService.create(Map.of("orderId", orderId, "promotionReservationId", campaignId, "stockReservationId", stockId))));
        steps.add(step("marketing.cancel-reservation", remote.transition("marketing", "cancel-reservation", campaignId)));
        steps.add(step("inventory.release", remote.transition("inventory", "release-reservation", stockId)));
        steps.add(step("trade.cancelled", tradeService.cancelOrder(orderId)));
        return result("demo-cancel", orderId, steps);
    }

    public Map<String, Object> demoFullChain(Map<String, Object> input) {
        Map<String, Object> checkout = demoCheckout(input);
        String orderId = String.valueOf(checkout.get("orderId"));
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.addAll(castSteps(checkout.get("steps")));
        steps.add(step("merchant.create", remote.create("merchant", Map.of("merchantId", "M-DEMO-1", "shopId", "SHOP-DEMO-1"))));
        steps.add(step("merchant.approve", remote.transition("merchant", "approve-merchant", "M-DEMO-1")));
        steps.add(step("content.create", remote.create("content", Map.of("contentId", "CONT-DEMO-1", "skuId", "SKU-DEMO-1"))));
        steps.add(step("content.approve", remote.transition("content", "approve-content", "CONT-DEMO-1")));
        steps.add(step("finance.record-payment", remote.create("finance", Map.of("settlementId", "SETTLE-DEMO-1", "paymentId", "PAY-DEMO-1", "merchantId", "M-DEMO-1"))));
        steps.add(step("finance.settle", remote.transition("finance", "create-merchant-settlement", "SETTLE-DEMO-1")));
        steps.add(step("supply-chain.purchase", remote.create("supply-chain", Map.of("purchaseOrderId", "PO-DEMO-1", "skuId", "SKU-DEMO-1"))));
        steps.add(step("supply-chain.quality", remote.transition("supply-chain", "approve-quality-check", "PO-DEMO-1")));
        steps.add(step("aftersales.create", remote.create("aftersales", Map.of("caseId", "AS-DEMO-1", "orderId", orderId))));
        steps.add(step("aftersales.approve", remote.transition("aftersales", "approve-case", "AS-DEMO-1")));
        steps.add(step("customer-service.ticket", remote.create("customer-service", Map.of("ticketId", "TICKET-DEMO-1", "userId", "U-DEMO-1", "bizRef", orderId))));
        steps.add(step("customer-service.resolve", remote.transition("customer-service", "resolve-ticket", "TICKET-DEMO-1")));
        return result("demo-full-chain", orderId, steps);
    }

    private static Map<String, Object> result(String scenario, String orderId, List<Map<String, Object>> steps) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scenario", scenario);
        result.put("orderId", orderId);
        result.put("stepCount", steps.size());
        result.put("steps", steps);
        return result;
    }

    private static Map<String, Object> step(String name, Map<String, Object> payload) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("name", name);
        step.put("payload", payload);
        return step;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castSteps(Object value) {
        return (List<Map<String, Object>>) value;
    }

    private static String value(Map<String, Object> input, String key, String fallback) {
        return String.valueOf(input.getOrDefault(key, fallback));
    }
}
