package com.ecommerce.logistics.dubbo;

import com.ecommerce.logistics.BusinessService;
import com.ecommerce.logistics.DomainService;
import com.ecommerce.logistics.api.LogisticsDubboService;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

public final class LogisticsDubboServiceImpl implements LogisticsDubboService {
    private final BusinessService businessService;

    public LogisticsDubboServiceImpl(BusinessService businessService) {
        this.businessService = businessService;
    }

    @Override
    public Map<String, Object> create(Map<String, Object> input) {
        return businessService.create(input);
    }

    @Override
    public Map<String, Object> transition(String action, String id) {
        try {
            Method method = BusinessService.class.getMethod(toCamel(action), String.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> result = (Map<String, Object>) method.invoke(businessService, id);
            return result;
        } catch (ReflectiveOperationException error) {
            throw new IllegalArgumentException("Unsupported action: " + action, error);
        }
    }

    @Override
    public Map<String, Object> get(String id) {
        return businessService.get(id);
    }

    @Override
    public List<Map<String, Object>> list() {
        return businessService.list();
    }

    @Override
    public Map<String, Object> knowledge() {
        return DomainService.knowledge();
    }

    private static String toCamel(String action) {
        StringBuilder result = new StringBuilder();
        boolean upper = false;
        for (char ch : action.toCharArray()) {
            if (ch == '-') {
                upper = true;
            } else if (upper) {
                result.append(Character.toUpperCase(ch));
                upper = false;
            } else {
                result.append(ch);
            }
        }
        return result.toString();
    }
}
