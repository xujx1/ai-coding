package com.ump.marketing.web.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.PreviewActivityDTO;
import com.ump.marketing.api.dto.PreviewHintDTO;
import com.ump.marketing.api.dto.PreviewQueryRequest;
import com.ump.marketing.api.dto.PreviewResponseDTO;
import com.ump.marketing.api.dto.PreviewSideResultDTO;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.PreviewService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PreviewControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private PreviewService previewService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new PreviewController(previewService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit returns success payload from service")
    void previewActivityHitSuccess() throws Exception {
        when(previewService.previewActivityHit(any(PreviewQueryRequest.class)))
                .thenReturn(RpcResult.success(buildSuccessResponse(), "req-success"));

        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.SUCCESS.getCode()))
                .andExpect(jsonPath("$.message").value(ErrorCode.SUCCESS.getMessage()))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.requestId").value("req-success"))
                .andExpect(jsonPath("$.data.managementResult.side").value("MANAGEMENT"))
                .andExpect(jsonPath("$.data.managementResult.hit").value(true))
                .andExpect(jsonPath("$.data.managementResult.activities[0].activityId").value("act-m-1"))
                .andExpect(jsonPath("$.data.runtimeResult.side").value("RUNTIME"))
                .andExpect(jsonPath("$.data.runtimeResult.hit").value(true))
                .andExpect(jsonPath("$.data.runtimeResult.activities[0].activityId").value("act-r-1"))
                .andExpect(jsonPath("$.data.diffHints[0].code").value("ACTIVITY_FIELD_DIFF"))
                .andExpect(jsonPath("$.data.querySummary.productId").value("product-1"))
                .andExpect(jsonPath("$.data.querySummary.queryMode").value("PRODUCT"));

        verify(previewService).previewActivityHit(any(PreviewQueryRequest.class));
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit forwards runtime degraded success payload")
    void previewActivityHitRuntimeDegraded() throws Exception {
        when(previewService.previewActivityHit(any(PreviewQueryRequest.class)))
                .thenReturn(RpcResult.success(buildDegradedResponse(), "req-degraded"));

        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.SUCCESS.getCode()))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.requestId").value("req-degraded"))
                .andExpect(jsonPath("$.data.runtimeResult.available").value(false))
                .andExpect(jsonPath("$.data.runtimeResult.summary").value("运行侧结果暂不可用"))
                .andExpect(jsonPath("$.data.diffHints[0].code").value("RUNTIME_UNAVAILABLE"))
                .andExpect(jsonPath("$.data.diffHints[0].title").value("运行侧结果暂不可用"));

        verify(previewService).previewActivityHit(any(PreviewQueryRequest.class));
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit returns validation error for missing productId")
    void previewActivityHitMissingProductId() throws Exception {
        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-product\",\"regionCode\":\"CN\",\"idempotencyKey\":\"idem-1\",\"operator\":\"tester\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("productId is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(previewService, never()).previewActivityHit(any(PreviewQueryRequest.class));
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit returns validation error for missing regionCode")
    void previewActivityHitMissingRegionCode() throws Exception {
        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-region\",\"productId\":\"product-1\",\"idempotencyKey\":\"idem-1\",\"operator\":\"tester\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("regionCode is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(previewService, never()).previewActivityHit(any(PreviewQueryRequest.class));
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit returns validation error for missing operator")
    void previewActivityHitMissingOperator() throws Exception {
        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-operator\",\"productId\":\"product-1\",\"regionCode\":\"CN\",\"idempotencyKey\":\"idem-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("operator is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(previewService, never()).previewActivityHit(any(PreviewQueryRequest.class));
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit returns validation error for missing idempotencyKey")
    void previewActivityHitMissingIdempotencyKey() throws Exception {
        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-idem\",\"productId\":\"product-1\",\"regionCode\":\"CN\",\"operator\":\"tester\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("idempotencyKey is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(previewService, never()).previewActivityHit(any(PreviewQueryRequest.class));
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit returns validation error when body is missing")
    void previewActivityHitMissingBody() throws Exception {
        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("request body is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(previewService, never()).previewActivityHit(any(PreviewQueryRequest.class));
    }

    @Test
    @DisplayName("POST /api/preview/activity-hit forwards sku priority request fields to service")
    void previewActivityHitForwardsSkuPriorityRequest() throws Exception {
        when(previewService.previewActivityHit(any(PreviewQueryRequest.class)))
                .thenReturn(RpcResult.success(buildSuccessResponse(), "req-sku"));

        PreviewQueryRequest request = buildValidRequest();
        request.setRequestId("req-sku");
        request.setSkuId("sku-1");
        request.setScopeType("SKU_LIST");

        mockMvc.perform(post("/api/preview/activity-hit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value("req-sku"));

        ArgumentCaptor<PreviewQueryRequest> captor = ArgumentCaptor.forClass(PreviewQueryRequest.class);
        verify(previewService).previewActivityHit(captor.capture());
        PreviewQueryRequest captured = captor.getValue();
        assertEquals("product-1", captured.getProductId());
        assertEquals("sku-1", captured.getSkuId());
        assertEquals("SKU_LIST", captured.getScopeType());
        assertEquals("CN", captured.getRegionCode());
        assertEquals("tester", captured.getOperator());
        assertEquals("req-sku", captured.getRequestId());
    }

    private String validRequestJson() throws Exception {
        return objectMapper.writeValueAsString(buildValidRequest());
    }

    private PreviewQueryRequest buildValidRequest() {
        PreviewQueryRequest request = new PreviewQueryRequest();
        request.setRequestId("req-1");
        request.setCaller("caller");
        request.setOperator("tester");
        request.setRegionCode("CN");
        request.setIdempotencyKey("idem-1");
        request.setTimestampMs(1000L);
        request.setProductId("product-1");
        request.setSkuId(null);
        request.setScopeType(null);
        return request;
    }

    private PreviewResponseDTO buildSuccessResponse() {
        PreviewResponseDTO response = new PreviewResponseDTO();
        response.setManagementResult(buildSideResult(
                "MANAGEMENT",
                true,
                true,
                "管理配置侧命中 1 个活动",
                "PRODUCT",
                Collections.singletonList(buildActivity("act-m-1", "MANAGEMENT", "product-1", null))
        ));
        response.setRuntimeResult(buildSideResult(
                "RUNTIME",
                true,
                true,
                "用户运行侧命中活动",
                "PRODUCT",
                Collections.singletonList(buildActivity("act-r-1", "RUNTIME", "product-1", null))
        ));
        response.setDiffHints(Arrays.asList(buildHint("ACTIVITY_FIELD_DIFF", "双侧活动字段存在差异")));

        PreviewResponseDTO.PreviewQuerySummaryDTO summary = new PreviewResponseDTO.PreviewQuerySummaryDTO();
        summary.setRequestId("req-1");
        summary.setOperator("tester");
        summary.setRegionCode("CN");
        summary.setProductId("product-1");
        summary.setSkuId(null);
        summary.setScopeType(null);
        summary.setQueryMode("PRODUCT");
        response.setQuerySummary(summary);
        return response;
    }

    private PreviewResponseDTO buildDegradedResponse() {
        PreviewResponseDTO response = new PreviewResponseDTO();
        response.setManagementResult(buildSideResult(
                "MANAGEMENT",
                true,
                true,
                "管理配置侧命中 1 个活动",
                "PRODUCT",
                Collections.singletonList(buildActivity("act-m-1", "MANAGEMENT", "product-1", null))
        ));

        PreviewSideResultDTO runtimeResult = buildSideResult(
                "RUNTIME",
                false,
                false,
                "运行侧结果暂不可用",
                "PRODUCT",
                Collections.<PreviewActivityDTO>emptyList()
        );
        runtimeResult.setReasonCode("RUNTIME_UNAVAILABLE");
        runtimeResult.setReasonMessage("运行侧接口调用失败或超时");
        runtimeResult.setHints(Collections.singletonList(buildHint("RUNTIME_UNAVAILABLE", "运行侧结果暂不可用")));
        response.setRuntimeResult(runtimeResult);
        response.setDiffHints(Collections.singletonList(buildHint("RUNTIME_UNAVAILABLE", "运行侧结果暂不可用")));

        PreviewResponseDTO.PreviewQuerySummaryDTO summary = new PreviewResponseDTO.PreviewQuerySummaryDTO();
        summary.setRequestId("req-1");
        summary.setOperator("tester");
        summary.setRegionCode("CN");
        summary.setProductId("product-1");
        summary.setQueryMode("PRODUCT");
        response.setQuerySummary(summary);
        return response;
    }

    private PreviewSideResultDTO buildSideResult(String side,
                                                 boolean hit,
                                                 boolean available,
                                                 String summary,
                                                 String queryMode,
                                                 java.util.List<PreviewActivityDTO> activities) {
        PreviewSideResultDTO result = new PreviewSideResultDTO();
        result.setSide(side);
        result.setHit(hit);
        result.setAvailable(available);
        result.setSummary(summary);
        result.setQueryMode(queryMode);
        result.setActivities(activities);
        result.setHints(Collections.singletonList(buildHint(side + "_HINT", side + " hint")));
        return result;
    }

    private PreviewActivityDTO buildActivity(String activityId, String sourceSide, String productId, String skuId) {
        PreviewActivityDTO activity = new PreviewActivityDTO();
        activity.setActivityId(activityId);
        activity.setActivityName("activity-" + activityId);
        activity.setStatus("ONLINE");
        activity.setToolType("FULL_REDUCE");
        activity.setThresholdAmount(new BigDecimal("100.00"));
        activity.setDiscountAmount(new BigDecimal("20.00"));
        activity.setDiscountRate(new BigDecimal("0.80"));
        activity.setMaxDiscount(new BigDecimal("30.00"));
        activity.setCouponTemplateId("coupon-1");
        activity.setRegionCode("CN");
        activity.setProductId(productId);
        activity.setSkuId(skuId);
        activity.setScopeType(skuId == null ? "PRODUCT_LIST" : "SKU_LIST");
        activity.setSourceSide(sourceSide);
        return activity;
    }

    private PreviewHintDTO buildHint(String code, String title) {
        PreviewHintDTO hint = new PreviewHintDTO();
        hint.setCode(code);
        hint.setCategory(code);
        hint.setTitle(title);
        hint.setDetail(title + " detail");
        hint.setMessage(title + " detail");
        return hint;
    }
}
