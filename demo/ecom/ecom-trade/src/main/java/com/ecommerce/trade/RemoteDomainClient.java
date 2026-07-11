package com.ecommerce.trade;

import org.apache.dubbo.config.ReferenceConfig;
import org.apache.dubbo.rpc.service.GenericService;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class RemoteDomainClient {
    private final Map<String, GenericService> cache = new ConcurrentHashMap<>();

    public RemoteDomainClient() {
        this(true);
    }

    protected RemoteDomainClient(boolean initializeDubbo) {
        // Trade also exports its own provider in this JVM. Keep the consumer side
        // application-neutral so Dubbo has a single ApplicationConfig per process.
    }

    public Map<String, Object> create(String domain, Map<String, Object> input) {
        return invokeMap(domain, "create", new String[]{"java.util.Map"}, new Object[]{input});
    }

    public Map<String, Object> transition(String domain, String action, String id) {
        return invokeMap(domain, "transition", new String[]{"java.lang.String", "java.lang.String"}, new Object[]{action, id});
    }

    public Map<String, Object> get(String domain, String id) {
        return invokeMap(domain, "get", new String[]{"java.lang.String"}, new Object[]{id});
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> list(String domain) {
        return (List<Map<String, Object>>) service(domain).$invoke("list", new String[]{}, new Object[]{});
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> invokeMap(String domain, String method, String[] types, Object[] args) {
        return (Map<String, Object>) service(domain).$invoke(method, types, args);
    }

    private GenericService service(String domain) {
        return cache.computeIfAbsent(domain, this::createReference);
    }

    private GenericService createReference(String domain) {
        ReferenceConfig<GenericService> reference = new ReferenceConfig<>();
        reference.setInterface(interfaceName(domain));
        reference.setGeneric("true");
        reference.setUrl(url(domain));
        reference.setCheck(false);
        reference.setTimeout(5000);
        return reference.get();
    }

    private static String interfaceName(String domain) {
        return switch (domain) {
            case "aftersales" -> "com.ecommerce.aftersales.api.AftersalesDubboService";
            case "content" -> "com.ecommerce.content.api.ContentDubboService";
            case "customer-service" -> "com.ecommerce.customerservice.api.CustomerServiceDubboService";
            case "finance" -> "com.ecommerce.finance.api.FinanceDubboService";
            case "fulfillment" -> "com.ecommerce.fulfillment.api.FulfillmentDubboService";
            case "inventory" -> "com.ecommerce.inventory.api.InventoryDubboService";
            case "logistics" -> "com.ecommerce.logistics.api.LogisticsDubboService";
            case "marketing" -> "com.ecommerce.marketing.api.MarketingDubboService";
            case "merchant" -> "com.ecommerce.merchant.api.MerchantDubboService";
            case "payment" -> "com.ecommerce.payment.api.PaymentDubboService";
            case "product" -> "com.ecommerce.product.api.ProductDubboService";
            case "supply-chain" -> "com.ecommerce.supplychain.api.SupplyChainDubboService";
            case "trade" -> "com.ecommerce.trade.api.TradeDubboService";
            case "user" -> "com.ecommerce.user.api.UserDubboService";
            default -> throw new IllegalArgumentException("Unknown ecom domain: " + domain);
        };
    }

    private static String url(String domain) {
        String envName = domain.toUpperCase().replace("-", "_") + "_DUBBO_URL";
        return System.getenv().getOrDefault(envName, switch (domain) {
            case "aftersales" -> "dubbo://127.0.0.1:4313";
            case "content" -> "dubbo://127.0.0.1:4320";
            case "customer-service" -> "dubbo://127.0.0.1:4321";
            case "finance" -> "dubbo://127.0.0.1:4322";
            case "fulfillment" -> "dubbo://127.0.0.1:4316";
            case "inventory" -> "dubbo://127.0.0.1:4315";
            case "logistics" -> "dubbo://127.0.0.1:4317";
            case "marketing" -> "dubbo://127.0.0.1:4314";
            case "merchant" -> "dubbo://127.0.0.1:4319";
            case "payment" -> "dubbo://127.0.0.1:4312";
            case "product" -> "dubbo://127.0.0.1:4310";
            case "supply-chain" -> "dubbo://127.0.0.1:4323";
            case "trade" -> "dubbo://127.0.0.1:4311";
            case "user" -> "dubbo://127.0.0.1:4318";
            default -> throw new IllegalArgumentException("Unknown ecom domain: " + domain);
        });
    }
}
