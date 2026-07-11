package com.ecommerce.logistics;

import java.util.Iterator;
import java.util.List;
import java.util.Map;

public final class JsonSupport {
    private JsonSupport() {
    }

    public static String toJson(Object value) {
        if (value == null) return "null";
        if (value instanceof String string) return quote(string);
        if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
        if (value instanceof Map<?, ?> map) return mapToJson(map);
        if (value instanceof List<?> list) return listToJson(list);
        return quote(String.valueOf(value));
    }

    private static String mapToJson(Map<?, ?> map) {
        StringBuilder json = new StringBuilder("{");
        Iterator<? extends Map.Entry<?, ?>> iterator = map.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<?, ?> entry = iterator.next();
            json.append(quote(String.valueOf(entry.getKey()))).append(":").append(toJson(entry.getValue()));
            if (iterator.hasNext()) json.append(",");
        }
        return json.append("}").toString();
    }

    private static String listToJson(List<?> list) {
        StringBuilder json = new StringBuilder("[");
        for (int index = 0; index < list.size(); index++) {
            json.append(toJson(list.get(index)));
            if (index + 1 < list.size()) json.append(",");
        }
        return json.append("]").toString();
    }

    private static String quote(String value) {
        StringBuilder escaped = new StringBuilder("\"");
        for (int index = 0; index < value.length(); index++) {
            char ch = value.charAt(index);
            switch (ch) {
                case '"' -> escaped.append("\\\"");
                case '\\' -> escaped.append("\\\\");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> escaped.append(ch);
            }
        }
        return escaped.append("\"").toString();
    }
}
