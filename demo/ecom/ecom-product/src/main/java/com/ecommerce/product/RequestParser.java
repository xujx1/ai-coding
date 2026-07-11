package com.ecommerce.product;

import java.util.LinkedHashMap;
import java.util.Map;

public final class RequestParser {
    private RequestParser() {
    }

    public static Map<String, Object> parseFlatJson(String body) {
        Map<String, Object> values = new LinkedHashMap<>();
        String content = body == null ? "" : body.trim();
        if (content.startsWith("{")) content = content.substring(1);
        if (content.endsWith("}")) content = content.substring(0, content.length() - 1);
        for (String pair : content.split(",")) {
            int colon = pair.indexOf(':');
            if (colon < 0) continue;
            String key = clean(pair.substring(0, colon));
            String raw = clean(pair.substring(colon + 1));
            if ("true".equalsIgnoreCase(raw) || "false".equalsIgnoreCase(raw)) {
                values.put(key, Boolean.parseBoolean(raw));
            } else {
                try {
                    values.put(key, Long.parseLong(raw));
                } catch (NumberFormatException ignored) {
                    values.put(key, raw);
                }
            }
        }
        return values;
    }

    private static String clean(String value) {
        String result = value.trim();
        if (result.startsWith("\"")) result = result.substring(1);
        if (result.endsWith("\"")) result = result.substring(0, result.length() - 1);
        return result.replace("\\\"", "\"");
    }
}
