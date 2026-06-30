package com.ump.marketing.application.service;

import com.ump.marketing.api.dto.PreviewActivityDTO;
import com.ump.marketing.api.dto.PreviewHintDTO;
import com.ump.marketing.api.dto.PreviewQueryRequest;
import com.ump.marketing.api.dto.PreviewResponseDTO;
import com.ump.marketing.api.dto.PreviewSideResultDTO;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.infrastructure.client.MarketingRuntimePreviewClient;
import com.ump.marketing.infrastructure.client.PreviewRuntimeClientException;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewRequest;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewResponse;
import com.ump.marketing.infrastructure.mapper.PreviewQueryMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PreviewServiceTest {

    @Mock
    private PreviewQueryMapper previewQueryMapper;
    @Mock
    private MarketingRuntimePreviewClient marketingRuntimePreviewClient;

    private PreviewService previewService;

    @BeforeEach
    void setUp() {
        previewService = new PreviewService(previewQueryMapper, marketingRuntimePreviewClient);
    }

    @Test
    @DisplayName("previewActivityHit uses sku query mode and prefers exact sku activities on both sides")
    void previewActivityHitSkuPriority() {
        PreviewQueryRequest request = buildRequest();
        request.setSkuId("sku-1");

        PreviewActivityDTO skuActivity = buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-1");
        PreviewActivityDTO fallbackActivity = buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", null, "PRODUCT_LIST", "coupon-1");
        PreviewActivityDTO anotherSkuActivity = buildActivity("act-2", "APPROVED", "DISCOUNT", "product-1", "sku-1", "SKU_LIST", "coupon-2");
        when(previewQueryMapper.selectActivities("CN", "product-1", "sku-1", null, true))
                .thenReturn(Arrays.asList(fallbackActivity, skuActivity, anotherSkuActivity));

        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.TRUE);
        runtimeResponse.setSummary("runtime hit");
        runtimeResponse.setActivities(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-1")));
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        assertEquals(ErrorCode.SUCCESS.getCode(), result.getCode());
        assertEquals("req-1", result.getRequestId());
        PreviewResponseDTO data = result.getData();
        assertNotNull(data);
        assertEquals("SKU", data.getQuerySummary().getQueryMode());
        assertEquals("sku-1", data.getQuerySummary().getSkuId());
        assertEquals(2, data.getManagementResult().getActivities().size());
        assertEquals("sku-1", data.getManagementResult().getActivities().get(0).getSkuId());
        assertEquals("MANAGEMENT", data.getManagementResult().getActivities().get(0).getSourceSide());
        assertEquals("sku-1", data.getRuntimeResult().getActivities().get(0).getSkuId());
        assertEquals("RUNTIME", data.getRuntimeResult().getActivities().get(0).getSourceSide());

        ArgumentCaptor<RuntimePreviewRequest> captor = ArgumentCaptor.forClass(RuntimePreviewRequest.class);
        verify(marketingRuntimePreviewClient).preview(captor.capture());
        RuntimePreviewRequest runtimeRequest = captor.getValue();
        assertEquals("product-1", runtimeRequest.getProductId());
        assertEquals("sku-1", runtimeRequest.getSkuId());
        assertNull(runtimeRequest.getScopeType());
    }

    @Test
    @DisplayName("previewActivityHit uses product query mode when skuId is absent")
    void previewActivityHitProductModeWithoutSku() {
        PreviewQueryRequest request = buildRequest();

        when(previewQueryMapper.selectActivities("CN", "product-1", null, null, false))
                .thenReturn(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", null, "PRODUCT_LIST", "coupon-1")));

        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.TRUE);
        runtimeResponse.setActivities(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", null, "PRODUCT_LIST", "coupon-1")));
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        assertEquals("PRODUCT", result.getData().getQuerySummary().getQueryMode());
        assertNull(result.getData().getQuerySummary().getSkuId());
        assertEquals("PRODUCT", result.getData().getManagementResult().getQueryMode());
        assertTrue(result.getData().getManagementResult().getHit());

        ArgumentCaptor<RuntimePreviewRequest> captor = ArgumentCaptor.forClass(RuntimePreviewRequest.class);
        verify(marketingRuntimePreviewClient).preview(captor.capture());
        RuntimePreviewRequest runtimeRequest = captor.getValue();
        assertEquals("product-1", runtimeRequest.getProductId());
        assertNull(runtimeRequest.getSkuId());
    }

    @Test
    @DisplayName("previewActivityHit keeps scopeType as optional filter and query summary echo")
    void previewActivityHitScopeTypeFilter() {
        PreviewQueryRequest request = buildRequest();
        request.setSkuId("sku-1");
        request.setScopeType("SKU_LIST");

        when(previewQueryMapper.selectActivities("CN", "product-1", "sku-1", "SKU_LIST", true))
                .thenReturn(Collections.singletonList(buildActivity("act-2", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-2")));

        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.TRUE);
        runtimeResponse.setQueryMode("SKU");
        runtimeResponse.setActivities(Collections.singletonList(buildActivity("act-2", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-2")));
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        assertEquals("SKU", result.getData().getQuerySummary().getQueryMode());
        assertEquals("SKU_LIST", result.getData().getQuerySummary().getScopeType());
        assertEquals("SKU_LIST", result.getData().getManagementResult().getActivities().get(0).getScopeType());

        ArgumentCaptor<RuntimePreviewRequest> captor = ArgumentCaptor.forClass(RuntimePreviewRequest.class);
        verify(marketingRuntimePreviewClient).preview(captor.capture());
        RuntimePreviewRequest runtimeRequest = captor.getValue();
        assertEquals("product-1", runtimeRequest.getProductId());
        assertEquals("sku-1", runtimeRequest.getSkuId());
        assertEquals("SKU_LIST", runtimeRequest.getScopeType());
    }

    @Test
    @DisplayName("previewActivityHit maps management and runtime hit payload fields")
    void previewActivityHitMapsAllFields() {
        PreviewQueryRequest request = buildRequest();
        request.setSkuId("sku-1");
        request.setScopeType("SKU_LIST");

        PreviewActivityDTO managementActivity = buildActivity("act-100", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-100");
        managementActivity.setActivityName("管理侧活动");
        when(previewQueryMapper.selectActivities("CN", "product-1", "sku-1", "SKU_LIST", true))
                .thenReturn(Collections.singletonList(managementActivity));

        PreviewActivityDTO runtimeActivity = buildActivity("act-100", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-100");
        runtimeActivity.setActivityName("运行侧活动");
        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.TRUE);
        runtimeResponse.setSummary("runtime hit");
        runtimeResponse.setQueryMode("SKU");
        runtimeResponse.setActivities(Collections.singletonList(runtimeActivity));
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        PreviewResponseDTO data = result.getData();
        PreviewActivityDTO management = data.getManagementResult().getActivities().get(0);
        PreviewActivityDTO runtime = data.getRuntimeResult().getActivities().get(0);
        assertEquals("act-100", management.getActivityId());
        assertEquals("管理侧活动", management.getActivityName());
        assertEquals("ONLINE", management.getStatus());
        assertEquals("FULL_REDUCE", management.getToolType());
        assertEquals(new BigDecimal("100.00"), management.getThresholdAmount());
        assertEquals(new BigDecimal("20.00"), management.getDiscountAmount());
        assertEquals(new BigDecimal("0.80"), management.getDiscountRate());
        assertEquals(new BigDecimal("30.00"), management.getMaxDiscount());
        assertEquals("coupon-100", management.getCouponTemplateId());
        assertEquals("CN", management.getRegionCode());
        assertEquals("product-1", management.getProductId());
        assertEquals("sku-1", management.getSkuId());
        assertEquals("SKU_LIST", management.getScopeType());
        assertEquals("MANAGEMENT", management.getSourceSide());
        assertEquals("RUNTIME", runtime.getSourceSide());
        assertEquals("product-1", data.getQuerySummary().getProductId());
        assertEquals("sku-1", data.getQuerySummary().getSkuId());
        assertEquals("SKU_LIST", data.getQuerySummary().getScopeType());
    }

    @Test
    @DisplayName("previewActivityHit keeps management result and adds diff hint when runtime misses")
    void previewActivityHitManagementHitRuntimeMiss() {
        PreviewQueryRequest request = buildRequest();
        when(previewQueryMapper.selectActivities("CN", "product-1", null, null, false))
                .thenReturn(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", null, "PRODUCT_LIST", "coupon-1")));

        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.FALSE);
        runtimeResponse.setSummary("runtime miss");
        runtimeResponse.setReasonMessage("活动未上线或尚未生效");
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        assertTrue(result.getData().getManagementResult().getHit());
        assertFalse(result.getData().getRuntimeResult().getHit());
        assertEquals(1, result.getData().getManagementResult().getActivities().size());
        assertTrue(containsHintCode(result.getData().getDiffHints(), "CONFIG_RUNTIME_DIFF"));
    }

    @Test
    @DisplayName("previewActivityHit returns empty success response with troubleshooting hints when both sides miss")
    void previewActivityHitBothSidesMiss() {
        PreviewQueryRequest request = buildRequest();
        when(previewQueryMapper.selectActivities("CN", "product-1", null, null, false))
                .thenReturn(Collections.<PreviewActivityDTO>emptyList());

        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.FALSE);
        runtimeResponse.setSummary("runtime miss");
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        PreviewSideResultDTO management = result.getData().getManagementResult();
        PreviewSideResultDTO runtime = result.getData().getRuntimeResult();
        assertFalse(management.getHit());
        assertFalse(runtime.getHit());
        assertTrue(management.getActivities().isEmpty());
        assertTrue(runtime.getActivities().isEmpty());
        assertTrue(containsHintCode(result.getData().getDiffHints(), "BOTH_NOT_HIT"));
        assertTrue(containsHintCode(management.getHints(), "PRODUCT_NOT_BOUND"));
        assertTrue(containsHintCode(management.getHints(), "REGION_MISMATCH"));
        assertTrue(containsHintCode(management.getHints(), "CONFIG_NOT_EFFECTIVE"));
    }

    @Test
    @DisplayName("previewActivityHit degrades gracefully when runtime client times out")
    void previewActivityHitRuntimeTimeout() {
        assertRuntimeUnavailable(new PreviewRuntimeClientException("timeout", new RuntimeException("timeout")));
    }

    @Test
    @DisplayName("previewActivityHit degrades gracefully when runtime client connection fails")
    void previewActivityHitRuntimeConnectionFailure() {
        assertRuntimeUnavailable(new PreviewRuntimeClientException("connect failed", new RuntimeException("connect failed")));
    }

    @Test
    @DisplayName("previewActivityHit preserves management result when runtime client returns unavailable response")
    void previewActivityHitRuntimeNonSuccess() {
        PreviewQueryRequest request = buildRequest();
        when(previewQueryMapper.selectActivities("CN", "product-1", null, null, false))
                .thenReturn(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", null, "PRODUCT_LIST", "coupon-1")));

        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.FALSE);
        runtimeResponse.setHit(Boolean.FALSE);
        runtimeResponse.setSummary("downstream unavailable");
        runtimeResponse.setReasonCode("DOWNSTREAM_ERROR");
        runtimeResponse.setReasonMessage("HTTP 500");
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        PreviewResponseDTO data = result.getData();
        assertTrue(data.getManagementResult().getHit());
        assertFalse(data.getRuntimeResult().getAvailable());
        assertEquals("downstream unavailable", data.getRuntimeResult().getSummary());
        assertEquals("DOWNSTREAM_ERROR", data.getRuntimeResult().getReasonCode());
        assertEquals("HTTP 500", data.getRuntimeResult().getReasonMessage());
        assertTrue(containsHintCode(data.getDiffHints(), "RUNTIME_UNAVAILABLE"));
    }

    @Test
    @DisplayName("previewActivityHit trims request fields before validation and querying")
    void previewActivityHitNormalizesRequest() {
        PreviewQueryRequest request = buildRequest();
        request.setProductId("  product-1  ");
        request.setSkuId("  sku-1  ");
        request.setScopeType("  SKU_LIST  ");
        request.setOperator("  tester  ");
        request.setRegionCode("  CN  ");
        request.setIdempotencyKey("  idem-1  ");
        request.setCaller("  caller  ");
        request.setRequestId("  req-1  ");

        when(previewQueryMapper.selectActivities("CN", "product-1", "sku-1", "SKU_LIST", true))
                .thenReturn(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-1")));
        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.TRUE);
        runtimeResponse.setActivities(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", "sku-1", "SKU_LIST", "coupon-1")));
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        assertEquals("req-1", result.getRequestId());
        assertEquals("product-1", result.getData().getQuerySummary().getProductId());
        assertEquals("sku-1", result.getData().getQuerySummary().getSkuId());
        assertEquals("SKU_LIST", result.getData().getQuerySummary().getScopeType());
        assertEquals("tester", result.getData().getQuerySummary().getOperator());
        assertEquals("CN", result.getData().getQuerySummary().getRegionCode());
    }

    @Test
    @DisplayName("previewActivityHit throws invalid argument when request is missing")
    void previewActivityHitNullRequest() {
        try {
            previewService.previewActivityHit(null);
        } catch (NullPointerException ex) {
            assertNotNull(ex);
            verifyNoInteractions(previewQueryMapper, marketingRuntimePreviewClient);
            return;
        }
        throw new AssertionError("Expected NullPointerException");
    }

    private void assertRuntimeUnavailable(PreviewRuntimeClientException exception) {
        PreviewQueryRequest request = buildRequest();
        when(previewQueryMapper.selectActivities("CN", "product-1", null, null, false))
                .thenReturn(Collections.singletonList(buildActivity("act-1", "ONLINE", "FULL_REDUCE", "product-1", null, "PRODUCT_LIST", "coupon-1")));
        when(marketingRuntimePreviewClient.preview(any(RuntimePreviewRequest.class))).thenThrow(exception);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(request);

        assertTrue(result.isSuccess());
        PreviewResponseDTO data = result.getData();
        assertTrue(data.getManagementResult().getHit());
        assertFalse(data.getRuntimeResult().getAvailable());
        assertEquals("RUNTIME_UNAVAILABLE", data.getRuntimeResult().getReasonCode());
        assertEquals("运行侧结果暂不可用", data.getRuntimeResult().getSummary());
        assertTrue(containsHintCode(data.getDiffHints(), "RUNTIME_UNAVAILABLE"));
    }

    private boolean containsHintCode(List<PreviewHintDTO> hints, String code) {
        for (PreviewHintDTO hint : hints) {
            if (code.equals(hint.getCode())) {
                return true;
            }
        }
        return false;
    }

    private PreviewQueryRequest buildRequest() {
        PreviewQueryRequest request = new PreviewQueryRequest();
        request.setRequestId("req-1");
        request.setCaller("caller");
        request.setOperator("tester");
        request.setRegionCode("CN");
        request.setIdempotencyKey("idem-1");
        request.setTimestampMs(1000L);
        request.setProductId("product-1");
        return request;
    }

    private PreviewActivityDTO buildActivity(String activityId,
                                             String status,
                                             String toolType,
                                             String productId,
                                             String skuId,
                                             String scopeType,
                                             String couponTemplateId) {
        PreviewActivityDTO activity = new PreviewActivityDTO();
        activity.setActivityId(activityId);
        activity.setActivityName("activity-" + activityId);
        activity.setStatus(status);
        activity.setToolType(toolType);
        activity.setThresholdAmount(new BigDecimal("100.00"));
        activity.setDiscountAmount(new BigDecimal("20.00"));
        activity.setDiscountRate(new BigDecimal("0.80"));
        activity.setMaxDiscount(new BigDecimal("30.00"));
        activity.setCouponTemplateId(couponTemplateId);
        activity.setRegionCode("CN");
        activity.setProductId(productId);
        activity.setSkuId(skuId);
        activity.setScopeType(scopeType);
        return activity;
    }
}
