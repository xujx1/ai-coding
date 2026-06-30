package com.ump.marketing.web.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.RuntimePreviewHitDTO;
import com.ump.marketing.api.dto.RuntimePreviewRequest;
import com.ump.marketing.api.dto.RuntimePreviewResponse;
import com.ump.marketing.application.service.RuntimePreviewService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.Collections;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class RuntimePreviewControllerTest {

    @Mock
    private RuntimePreviewService runtimePreviewService;

    @InjectMocks
    private RuntimePreviewController runtimePreviewController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("POST /api/runtime-preview/query returns the runtime preview contract for a valid request")
    void queryReturnsSuccessContract() throws Exception {
        MockMvc mockMvc = buildMockMvc();
        RuntimePreviewRequest request = buildValidRequest();
        RuntimePreviewResponse response = buildSuccessResponse();

        when(runtimePreviewService.queryRuntimePreview(org.mockito.ArgumentMatchers.any(RuntimePreviewRequest.class)))
                .thenReturn(response);

        mockMvc.perform(post("/api/runtime-preview/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.message").value("SUCCESS"))
                .andExpect(jsonPath("$.requestId").value("req-ok"))
                .andExpect(jsonPath("$.data.hit").value(true))
                .andExpect(jsonPath("$.data.matchedDimension").value("SKU"))
                .andExpect(jsonPath("$.data.scopeKey").value("scope-key-1"))
                .andExpect(jsonPath("$.data.activities", hasSize(1)))
                .andExpect(jsonPath("$.data.activities[0].activityId").value("ACT-1"))
                .andExpect(jsonPath("$.data.activities[0].toolType").value("FULL_REDUCE"))
                .andExpect(jsonPath("$.data.activities[0].discountAmount").value(20.00))
                .andExpect(jsonPath("$.data.activities[0].regionCode").value("CN"))
                .andExpect(jsonPath("$.data.missReasonCodes", hasSize(0)))
                .andExpect(jsonPath("$.data.syncHints", hasSize(0)));

        ArgumentCaptor<RuntimePreviewRequest> captor = ArgumentCaptor.forClass(RuntimePreviewRequest.class);
        verify(runtimePreviewService).queryRuntimePreview(captor.capture());
        RuntimePreviewRequest actual = captor.getValue();
        org.junit.jupiter.api.Assertions.assertEquals("req-ok", actual.getRequestId());
        org.junit.jupiter.api.Assertions.assertEquals("CN", actual.getRegionCode());
        org.junit.jupiter.api.Assertions.assertEquals("PRODUCT", actual.getScopeType());
        org.junit.jupiter.api.Assertions.assertEquals("P-100", actual.getProductId());
        org.junit.jupiter.api.Assertions.assertEquals("SKU-100", actual.getSkuId());
    }

    @Test
    @DisplayName("POST /api/runtime-preview/query rejects missing regionCode")
    void queryRejectsMissingRegionCode() throws Exception {
        MockMvc mockMvc = buildMockMvc();

        mockMvc.perform(post("/api/runtime-preview/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-invalid\",\"operator\":\"tester\",\"scopeType\":\"PRODUCT\",\"productId\":\"P-100\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(40001))
                .andExpect(jsonPath("$.message").value("regionCode is required"))
                .andExpect(jsonPath("$.requestId").value("req-invalid"));
    }

    @Test
    @DisplayName("POST /api/runtime-preview/query rejects missing scopeType")
    void queryRejectsMissingScopeType() throws Exception {
        MockMvc mockMvc = buildMockMvc();

        mockMvc.perform(post("/api/runtime-preview/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-invalid\",\"regionCode\":\"CN\",\"operator\":\"tester\",\"productId\":\"P-100\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(40001))
                .andExpect(jsonPath("$.message").value("scopeType is required"));
    }

    @Test
    @DisplayName("POST /api/runtime-preview/query rejects blank productId")
    void queryRejectsBlankProductId() throws Exception {
        MockMvc mockMvc = buildMockMvc();

        mockMvc.perform(post("/api/runtime-preview/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-invalid\",\"regionCode\":\"CN\",\"operator\":\"tester\",\"scopeType\":\"PRODUCT\",\"productId\":\"   \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(40001))
                .andExpect(jsonPath("$.message").value("productId is required"));
    }

    @Test
    @DisplayName("POST /api/runtime-preview/query rejects unsupported preview scopeType values")
    void queryRejectsUnsupportedScopeType() throws Exception {
        MockMvc mockMvc = buildMockMvc();

        mockMvc.perform(post("/api/runtime-preview/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-invalid\",\"regionCode\":\"CN\",\"operator\":\"tester\",\"scopeType\":\"CATEGORY\",\"productId\":\"P-100\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(40001))
                .andExpect(jsonPath("$.message").value("scopeType must be PRODUCT or SKU"))
                .andExpect(jsonPath("$.requestId").value("req-invalid"));
    }

    @Test
    @DisplayName("POST /api/runtime-preview/query rejects malformed JSON body")
    void queryRejectsInvalidJson() throws Exception {
        MockMvc mockMvc = buildMockMvc();

        mockMvc.perform(post("/api/runtime-preview/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-invalid\""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(40001))
                .andExpect(jsonPath("$.message").value("invalid request body"));
    }

    private MockMvc buildMockMvc() {
        return MockMvcBuilders.standaloneSetup(runtimePreviewController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private RuntimePreviewRequest buildValidRequest() {
        RuntimePreviewRequest request = new RuntimePreviewRequest();
        request.setRequestId("req-ok");
        request.setRegionCode("CN");
        request.setOperator("tester");
        request.setScopeType("PRODUCT");
        request.setProductId("P-100");
        request.setSkuId("SKU-100");
        return request;
    }

    private RuntimePreviewResponse buildSuccessResponse() {
        RuntimePreviewHitDTO hit = new RuntimePreviewHitDTO();
        hit.setActivityId("ACT-1");
        hit.setActivityName("Activity One");
        hit.setStatus("ONLINE");
        hit.setToolType("FULL_REDUCE");
        hit.setThresholdAmount(new BigDecimal("100.00"));
        hit.setDiscountAmount(new BigDecimal("20.00"));
        hit.setRegionCode("CN");
        hit.setScopeKey("scope-key-1");
        hit.setMatchedDimension("SKU");
        hit.setProductId("P-100");
        hit.setSkuId("SKU-100");
        hit.setScopeType("SKU");

        RuntimePreviewResponse response = new RuntimePreviewResponse();
        response.setHit(true);
        response.setMatchedDimension("SKU");
        response.setScopeKey("scope-key-1");
        response.setActivities(Collections.singletonList(hit));
        response.setMissReasonCodes(Collections.<String>emptyList());
        response.setSyncHints(Collections.<String>emptyList());
        return response;
    }
}
