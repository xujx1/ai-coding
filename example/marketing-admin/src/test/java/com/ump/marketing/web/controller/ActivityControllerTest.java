package com.ump.marketing.web.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.DeleteActivityRequest;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.ActivityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.nullValue;

@ExtendWith(MockitoExtension.class)
class ActivityControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private ActivityService activityService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ActivityController(activityService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("POST /api/activity/delete returns success payload from service")
    void deleteSuccess() throws Exception {
        when(activityService.deleteActivity(any(DeleteActivityRequest.class)))
                .thenReturn(RpcResult.success(null, "req-success"));

        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.SUCCESS.getCode()))
                .andExpect(jsonPath("$.message").value(ErrorCode.SUCCESS.getMessage()))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.requestId").value("req-success"));

        verify(activityService).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete forwards illegal state response")
    void deleteIllegalState() throws Exception {
        when(activityService.deleteActivity(any(DeleteActivityRequest.class)))
                .thenReturn(RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                        "Only DRAFT, REJECTED or TERMINATED activities can be deleted, current status: ONLINE",
                        "req-illegal"));

        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.ILLEGAL_STATE.getCode()))
                .andExpect(jsonPath("$.message").value("Only DRAFT, REJECTED or TERMINATED activities can be deleted, current status: ONLINE"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value("req-illegal"));

        verify(activityService).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete forwards resource not found response")
    void deleteNotFound() throws Exception {
        when(activityService.deleteActivity(any(DeleteActivityRequest.class)))
                .thenReturn(RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", "req-not-found"));

        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.RESOURCE_NOT_FOUND.getCode()))
                .andExpect(jsonPath("$.message").value("Activity not found"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value("req-not-found"));

        verify(activityService).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete forwards idempotency conflict response")
    void deleteIdempotencyConflict() throws Exception {
        when(activityService.deleteActivity(any(DeleteActivityRequest.class)))
                .thenReturn(RpcResult.fail(ErrorCode.IDEMPOTENCY_CONFLICT, "Idempotency key conflict", "req-conflict"));

        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.IDEMPOTENCY_CONFLICT.getCode()))
                .andExpect(jsonPath("$.message").value("Idempotency key conflict"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value("req-conflict"));

        verify(activityService).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete returns validation error for missing activityId")
    void deleteMissingActivityId() throws Exception {
        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-activity\",\"regionCode\":\"CN\",\"idempotencyKey\":\"idem-1\",\"operator\":\"tester\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("activityId is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(activityService, never()).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete returns validation error for missing regionCode")
    void deleteMissingRegionCode() throws Exception {
        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-region\",\"activityId\":\"act-1\",\"idempotencyKey\":\"idem-1\",\"operator\":\"tester\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("regionCode is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(activityService, never()).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete returns validation error for missing idempotencyKey")
    void deleteMissingIdempotencyKey() throws Exception {
        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-idem\",\"activityId\":\"act-1\",\"regionCode\":\"CN\",\"operator\":\"tester\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("idempotencyKey is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(activityService, never()).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete returns validation error for missing operator")
    void deleteMissingOperator() throws Exception {
        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestId\":\"req-missing-operator\",\"activityId\":\"act-1\",\"regionCode\":\"CN\",\"idempotencyKey\":\"idem-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("operator is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(activityService, never()).deleteActivity(any(DeleteActivityRequest.class));
    }

    @Test
    @DisplayName("POST /api/activity/delete returns validation error when body is missing")
    void deleteMissingBody() throws Exception {
        mockMvc.perform(post("/api/activity/delete")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_ARGUMENT.getCode()))
                .andExpect(jsonPath("$.message").value("request body is required"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.requestId").value(nullValue()));

        verify(activityService, never()).deleteActivity(any(DeleteActivityRequest.class));
    }

    private String validRequestJson() throws Exception {
        DeleteActivityRequest request = new DeleteActivityRequest();
        request.setRequestId("req-1");
        request.setActivityId("act-1");
        request.setRegionCode("CN");
        request.setIdempotencyKey("idem-1");
        request.setOperator("tester");
        request.setCaller("caller");
        request.setTimestampMs(1000L);
        return objectMapper.writeValueAsString(request);
    }
}
