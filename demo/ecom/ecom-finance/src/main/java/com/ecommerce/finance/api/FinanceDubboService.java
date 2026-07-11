package com.ecommerce.finance.api;

import java.util.List;
import java.util.Map;

public interface FinanceDubboService {
    Map<String, Object> create(Map<String, Object> input);

    Map<String, Object> transition(String action, String id);

    Map<String, Object> get(String id);

    List<Map<String, Object>> list();

    Map<String, Object> knowledge();
}
