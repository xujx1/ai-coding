package com.ump.marketing.infrastructure.client;

import com.ump.marketing.api.dto.PreviewActivityDTO;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewRequest;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewResponse;
import com.ump.marketing.infrastructure.config.PreviewRuntimeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Adapts runtime preview calls to the downstream marketing service.
 */
@Component
public class MarketingRuntimePreviewClient {
    private static final Logger log = LoggerFactory.getLogger(MarketingRuntimePreviewClient.class);

    private final RestTemplate restTemplate;
    private final PreviewRuntimeProperties properties;

    public MarketingRuntimePreviewClient(@Qualifier("previewRuntimeRestTemplate") RestTemplate restTemplate,
                                         PreviewRuntimeProperties properties) {
        this.restTemplate = restTemplate;
        this.properties = properties;
    }

    /**
     * Calls the downstream runtime preview API.
     */
    public RuntimePreviewResponse preview(RuntimePreviewRequest request) {
        String url = properties.getBaseUrl() + "/api/runtime/preview/activity-hit";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                new HttpEntity<>(request, headers),
                new ParameterizedTypeReference<Map<String, Object>>() {
                }
            );
            return adaptResponse(response.getBody(), request);
        } catch (RestClientException ex) {
            log.warn("Runtime preview call failed for requestId={}", request.getRequestId(), ex);
            throw new PreviewRuntimeClientException("runtime preview unavailable", ex);
        }
    }

    private RuntimePreviewResponse adaptResponse(Map<String, Object> body, RuntimePreviewRequest request) {
        RuntimePreviewResponse response = new RuntimePreviewResponse();
        response.setQueryMode(hasText(request.getSkuId()) ? "SKU" : "PRODUCT");
        if (body == null) {
            response.setAvailable(Boolean.FALSE);
            response.setReasonCode("RUNTIME_EMPTY_RESPONSE");
            response.setReasonMessage("运行侧返回为空");
            response.setSummary("运行侧结果暂不可用");
            return response;
        }

        Object success = body.get("success");
        response.setAvailable(!(success instanceof Boolean) || (Boolean) success);
        Object message = body.get("message");
        if (message != null) {
            response.setSummary(String.valueOf(message));
        }
        Object code = body.get("code");
        if (code != null && !Objects.equals("SUCCESS", String.valueOf(code))) {
            response.setReasonCode(String.valueOf(code));
        }

        Object data = body.get("data");
        if (!(data instanceof Map)) {
            response.setHit(Boolean.FALSE);
            response.setActivities(new ArrayList<PreviewActivityDTO>());
            if (!response.getAvailable()) {
                if (!hasText(response.getReasonCode())) {
                    response.setReasonCode("RUNTIME_FAILURE");
                }
                response.setReasonMessage(response.getSummary());
            }
            return response;
        }

        Map<?, ?> payload = (Map<?, ?>) data;
        response.setHit(asBoolean(payload.get("hit")));
        response.setAvailable(asBoolean(payload.get("available"), response.getAvailable()));
        if (payload.get("summary") != null) {
            response.setSummary(String.valueOf(payload.get("summary")));
        }
        if (payload.get("queryMode") != null) {
            response.setQueryMode(String.valueOf(payload.get("queryMode")));
        }
        if (payload.get("reasonCode") != null) {
            response.setReasonCode(String.valueOf(payload.get("reasonCode")));
        }
        if (payload.get("reasonMessage") != null) {
            response.setReasonMessage(String.valueOf(payload.get("reasonMessage")));
        }
        response.setActivities(adaptActivities(payload.get("activities")));
        return response;
    }

    private List<PreviewActivityDTO> adaptActivities(Object value) {
        List<PreviewActivityDTO> activities = new ArrayList<>();
        if (!(value instanceof List)) {
            return activities;
        }
        for (Object item : (List<?>) value) {
            if (!(item instanceof Map)) {
                continue;
            }
            Map<?, ?> source = (Map<?, ?>) item;
            PreviewActivityDTO activity = new PreviewActivityDTO();
            activity.setActivityId(asString(source.get("activityId")));
            activity.setActivityName(asString(source.get("activityName")));
            activity.setStatus(asString(source.get("status")));
            activity.setToolType(asString(source.get("toolType")));
            activity.setThresholdAmount(asBigDecimal(source.get("thresholdAmount")));
            activity.setDiscountAmount(asBigDecimal(source.get("discountAmount")));
            activity.setDiscountRate(asBigDecimal(source.get("discountRate")));
            activity.setMaxDiscount(asBigDecimal(source.get("maxDiscount")));
            activity.setCouponTemplateId(asString(source.get("couponTemplateId")));
            activity.setRegionCode(asString(source.get("regionCode")));
            activity.setProductId(asString(source.get("productId")));
            activity.setSkuId(asString(source.get("skuId")));
            activity.setScopeType(asString(source.get("scopeType")));
            activity.setSourceSide("RUNTIME");
            activities.add(activity);
        }
        return activities;
    }

    private Boolean asBoolean(Object value) {
        return asBoolean(value, Boolean.FALSE);
    }

    private Boolean asBoolean(Object value, Boolean defaultValue) {
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof String) {
            return Boolean.valueOf((String) value);
        }
        return defaultValue;
    }

    private BigDecimal asBigDecimal(Object value) {
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        if (value instanceof Number) {
            return BigDecimal.valueOf(((Number) value).doubleValue());
        }
        if (value instanceof String && hasText((String) value)) {
            try {
                return new BigDecimal((String) value);
            } catch (NumberFormatException ex) {
                log.debug("Ignore non-numeric runtime preview field value={}", value);
            }
        }
        return null;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
