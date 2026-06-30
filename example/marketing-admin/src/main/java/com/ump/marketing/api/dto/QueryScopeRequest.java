package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QueryScopeRequest extends BaseRequest {
    private static final long serialVersionUID = 1L;
    private String scopeKey;
    private String productId;
    private String skuId;
    private String scopeType;
}
