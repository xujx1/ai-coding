package com.ecommerce.aftersales;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class DomainService {
    private DomainService() {
    }

    public static Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("service", DomainContext.SERVICE_NAME);
        result.put("domain", DomainContext.DOMAIN);
        return result;
    }

    public static Map<String, Object> knowledge() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("domain", DomainContext.DOMAIN);
        result.put("domainName", DomainContext.DOMAIN_NAME);
        result.put("serviceName", DomainContext.SERVICE_NAME);
        result.put("port", DomainContext.PORT);
        result.put("summary", DomainContext.SUMMARY);
        result.put("capabilities", DomainContext.CAPABILITIES);
        result.put("owns", DomainContext.OWNS);
        result.put("upstreamDependencies", DomainContext.UPSTREAM_DEPENDENCIES);
        result.put("downstreamConsumers", DomainContext.DOWNSTREAM_CONSUMERS);
        result.put("requirementKeywords", DomainContext.REQUIREMENT_KEYWORDS);
        result.put("sampleRoutes", DomainContext.SAMPLE_ROUTES);
        return result;
    }

    public static Map<String, Object> sampleData() {
        List<Map<String, Object>> records = new ArrayList<>();
        for (int index = 0; index < DomainContext.OWNS.size(); index++) {
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("id", DomainContext.DOMAIN + "-" + (index + 1));
            record.put("concept", DomainContext.OWNS.get(index));
            record.put("status", index % 2 == 0 ? "active" : "draft");
            records.add(record);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("domain", DomainContext.DOMAIN);
        result.put("records", records);
        return result;
    }

    public static Map<String, Object> validateRequirement(String requirement) {
        String normalized = requirement == null ? "" : requirement.toLowerCase(Locale.ROOT);
        List<String> matchedKeywords = DomainContext.REQUIREMENT_KEYWORDS.stream()
                .filter(keyword -> normalized.contains(keyword.toLowerCase(Locale.ROOT)))
                .toList();
        List<String> matchedCapabilities = DomainContext.CAPABILITIES.stream()
                .filter(capability -> matchesCapability(normalized, capability))
                .toList();
        boolean impacted = !matchedKeywords.isEmpty() || !matchedCapabilities.isEmpty();
        double confidence = impacted
                ? Math.min(0.95, 0.55 + (matchedKeywords.size() + matchedCapabilities.size()) * 0.1)
                : 0.15;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("domain", DomainContext.DOMAIN);
        result.put("impacted", impacted);
        result.put("confidence", confidence);
        result.put("matchedKeywords", matchedKeywords);
        result.put("matchedCapabilities", matchedCapabilities);
        result.put("upstreamDependencies", impacted ? DomainContext.UPSTREAM_DEPENDENCIES : List.of());
        result.put("downstreamConsumers", impacted ? DomainContext.DOWNSTREAM_CONSUMERS : List.of());
        return result;
    }

    private static boolean matchesCapability(String normalized, String capability) {
        if (normalized.contains(capability.toLowerCase(Locale.ROOT))) return true;
        for (String part : capability.split("-")) {
            if (!part.isBlank() && normalized.contains(part.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }
}
