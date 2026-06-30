package com.ump.marketing.infrastructure.client;

import com.ump.marketing.api.dto.PreviewActivityDTO;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewRequest;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewResponse;
import com.ump.marketing.infrastructure.config.PreviewRuntimeProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@SuppressWarnings({"rawtypes", "unchecked"})
@ExtendWith(MockitoExtension.class)
class MarketingRuntimePreviewClientTest {

    @Mock
    private RestTemplate restTemplate;

    private MarketingRuntimePreviewClient marketingRuntimePreviewClient;

    @BeforeEach
    void setUp() {
        PreviewRuntimeProperties properties = new PreviewRuntimeProperties();
        properties.setBaseUrl("http://127.0.0.1:18080");
        properties.setConnectTimeoutMs(200);
        properties.setReadTimeoutMs(500);
        marketingRuntimePreviewClient = new MarketingRuntimePreviewClient(restTemplate, properties);
    }

    @Test
    @DisplayName("preview sends full runtime request payload and adapts success response")
    void previewSendsPayloadAndAdaptsSuccessResponse() {
        RuntimePreviewRequest request = buildRequest();

        Map<String, Object> activity = new LinkedHashMap<>();
        activity.put("activityId", "act-1");
        activity.put("activityName", "runtime-activity");
        activity.put("status", "ONLINE");
        activity.put("toolType", "FULL_REDUCE");
        activity.put("thresholdAmount", "100.00");
        activity.put("discountAmount", new BigDecimal("20.00"));
        activity.put("discountRate", 0.8d);
        activity.put("maxDiscount", "30.00");
        activity.put("couponTemplateId", "coupon-1");
        activity.put("regionCode", "CN");
        activity.put("productId", "product-1");
        activity.put("skuId", "sku-1");
        activity.put("scopeType", "SKU_LIST");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("hit", true);
        payload.put("available", true);
        payload.put("summary", "runtime hit");
        payload.put("queryMode", "SKU");
        payload.put("reasonCode", null);
        payload.put("reasonMessage", null);
        payload.put("activities", Collections.singletonList(activity));

        Map<String, Object> responseBody = new LinkedHashMap<>();
        responseBody.put("success", true);
        responseBody.put("code", "SUCCESS");
        responseBody.put("message", "success");
        responseBody.put("data", payload);

        when(restTemplate.exchange(
                eq("http://127.0.0.1:18080/api/runtime/preview/activity-hit"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                any(ParameterizedTypeReference.class)
        )).thenReturn(ResponseEntity.ok(responseBody));

        RuntimePreviewResponse result = marketingRuntimePreviewClient.preview(request);

        ArgumentCaptor<HttpEntity> captor = ArgumentCaptor.forClass(HttpEntity.class);
        org.mockito.Mockito.verify(restTemplate).exchange(
                eq("http://127.0.0.1:18080/api/runtime/preview/activity-hit"),
                eq(HttpMethod.POST),
                captor.capture(),
                any(ParameterizedTypeReference.class)
        );
        HttpEntity entity = captor.getValue();
        assertNotNull(entity.getHeaders().getContentType());
        RuntimePreviewRequest sent = (RuntimePreviewRequest) entity.getBody();
        assertNotNull(sent);
        assertEquals("CN", sent.getRegionCode());
        assertEquals("tester", sent.getOperator());
        assertEquals("product-1", sent.getProductId());
        assertEquals("sku-1", sent.getSkuId());
        assertEquals("SKU_LIST", sent.getScopeType());

        assertTrue(result.getAvailable());
        assertTrue(result.getHit());
        assertEquals("runtime hit", result.getSummary());
        assertEquals("SKU", result.getQueryMode());
        assertEquals(1, result.getActivities().size());
        PreviewActivityDTO previewActivity = result.getActivities().get(0);
        assertEquals("act-1", previewActivity.getActivityId());
        assertEquals("runtime-activity", previewActivity.getActivityName());
        assertEquals("ONLINE", previewActivity.getStatus());
        assertEquals("FULL_REDUCE", previewActivity.getToolType());
        assertEquals(new BigDecimal("100.00"), previewActivity.getThresholdAmount());
        assertEquals(new BigDecimal("20.00"), previewActivity.getDiscountAmount());
        assertEquals(new BigDecimal("0.8"), previewActivity.getDiscountRate());
        assertEquals(new BigDecimal("30.00"), previewActivity.getMaxDiscount());
        assertEquals("coupon-1", previewActivity.getCouponTemplateId());
        assertEquals("CN", previewActivity.getRegionCode());
        assertEquals("product-1", previewActivity.getProductId());
        assertEquals("sku-1", previewActivity.getSkuId());
        assertEquals("SKU_LIST", previewActivity.getScopeType());
        assertEquals("RUNTIME", previewActivity.getSourceSide());
    }

    @Test
    @DisplayName("preview adapts non success rpc response into unavailable runtime result")
    void previewAdaptsNonSuccessResponse() {
        RuntimePreviewRequest request = buildRequest();
        request.setSkuId(null);
        request.setScopeType(null);

        Map<String, Object> responseBody = new LinkedHashMap<>();
        responseBody.put("success", false);
        responseBody.put("code", "DOWNSTREAM_TIMEOUT");
        responseBody.put("message", "runtime timeout");
        responseBody.put("data", null);

        when(restTemplate.exchange(
                eq("http://127.0.0.1:18080/api/runtime/preview/activity-hit"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                any(ParameterizedTypeReference.class)
        )).thenReturn(ResponseEntity.ok(responseBody));

        RuntimePreviewResponse result = marketingRuntimePreviewClient.preview(request);

        assertFalse(result.getAvailable());
        assertFalse(result.getHit());
        assertEquals("PRODUCT", result.getQueryMode());
        assertEquals("runtime timeout", result.getSummary());
        assertEquals("DOWNSTREAM_TIMEOUT", result.getReasonCode());
        assertEquals("runtime timeout", result.getReasonMessage());
        assertTrue(result.getActivities().isEmpty());
    }

    @Test
    @DisplayName("preview treats null response body as unavailable runtime result")
    void previewHandlesNullBody() {
        when(restTemplate.exchange(
                eq("http://127.0.0.1:18080/api/runtime/preview/activity-hit"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                any(ParameterizedTypeReference.class)
        )).thenReturn(ResponseEntity.ok(null));

        RuntimePreviewResponse result = marketingRuntimePreviewClient.preview(buildRequest());

        assertFalse(result.getAvailable());
        assertFalse(result.getHit());
        assertEquals("运行侧结果暂不可用", result.getSummary());
        assertEquals("RUNTIME_EMPTY_RESPONSE", result.getReasonCode());
        assertEquals("运行侧返回为空", result.getReasonMessage());
    }

    @Test
    @DisplayName("preview wraps RestTemplate exceptions with PreviewRuntimeClientException")
    void previewWrapsRestTemplateException() {
        when(restTemplate.exchange(
                eq("http://127.0.0.1:18080/api/runtime/preview/activity-hit"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                any(ParameterizedTypeReference.class)
        )).thenThrow(new RestClientException("connect failed"));

        try {
            marketingRuntimePreviewClient.preview(buildRequest());
        } catch (PreviewRuntimeClientException ex) {
            assertEquals("runtime preview unavailable", ex.getMessage());
            assertTrue(ex.getCause() instanceof RestClientException);
            return;
        }
        throw new AssertionError("Expected PreviewRuntimeClientException");
    }

    private RuntimePreviewRequest buildRequest() {
        RuntimePreviewRequest request = new RuntimePreviewRequest();
        request.setRequestId("req-1");
        request.setCaller("caller");
        request.setOperator("tester");
        request.setRegionCode("CN");
        request.setIdempotencyKey("idem-1");
        request.setTimestampMs(1000L);
        request.setProductId("product-1");
        request.setSkuId("sku-1");
        request.setScopeType("SKU_LIST");
        return request;
    }
}
