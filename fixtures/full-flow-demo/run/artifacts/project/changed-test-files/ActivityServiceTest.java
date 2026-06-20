package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.DeleteActivityRequest;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.Activity;
import com.ump.marketing.infrastructure.cache.LocalCache;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.mapper.ActivityMapper;
import com.ump.marketing.infrastructure.sharding.RegionRouter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ActivityServiceTest {

    @Mock
    private ActivityMapper activityMapper;
    @Mock
    private IdempotencyService idempotencyService;
    @Mock
    private AuditService auditService;
    @Mock
    private SyncEventPublisher syncEventPublisher;
    @Mock
    private RegionRouter regionRouter;
    @Mock
    private IdGenerator idGenerator;
    @Mock
    private LocalCache localCache;

    private ActivityService activityService;

    @BeforeEach
    void setUp() {
        activityService = new ActivityService(
                activityMapper,
                idempotencyService,
                auditService,
                syncEventPublisher,
                regionRouter,
                idGenerator,
                localCache,
                new ObjectMapper()
        );
    }

    @Test
    @DisplayName("deleteActivity returns invalid argument when request body is null")
    void deleteActivityNullRequest() {
        RpcResult<Void> result = activityService.deleteActivity(null);

        assertFalse(result.isSuccess());
        assertEquals(ErrorCode.INVALID_ARGUMENT.getCode(), result.getCode());
        assertEquals("request body is required", result.getMessage());
        verifyNoInteractions(activityMapper, idempotencyService, auditService);
    }

    @Test
    @DisplayName("deleteActivity deletes a draft activity and records audit plus idempotency result")
    void deleteActivityDraftSuccess() {
        DeleteActivityRequest request = buildRequest("req-1", "idem-1", "act-1", "CN", "operator-1");
        Activity activity = buildActivity("act-1", "CN", ActivityStatus.DRAFT.name(), 3, false, "creator");

        when(idempotencyService.checkAndRecord(eq("idem-1"), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-1")))
                .thenReturn(null);
        when(activityMapper.selectByActivityId("act-1", "CN")).thenReturn(activity);
        when(activityMapper.softDelete(eq("act-1"), eq("CN"), eq(ActivityStatus.DRAFT.name()), eq(3), anyLong(), eq("operator-1")))
                .thenReturn(1);

        RpcResult<Void> result = activityService.deleteActivity(request);

        assertTrue(result.isSuccess());
        assertEquals(ErrorCode.SUCCESS.getCode(), result.getCode());
        assertEquals("req-1", result.getRequestId());

        ArgumentCaptor<String> beforeCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> afterCaptor = ArgumentCaptor.forClass(String.class);
        verify(auditService).logStateChange(eq("req-1"), eq("operator-1"), eq("DELETE_ACTIVITY"),
                eq("Activity"), eq("act-1"), eq("CN"), beforeCaptor.capture(), afterCaptor.capture());
        assertTrue(beforeCaptor.getValue().contains("\"status\":\"DRAFT\""));
        assertTrue(beforeCaptor.getValue().contains("\"isDeleted\":false"));
        assertTrue(beforeCaptor.getValue().contains("\"version\":3"));
        assertTrue(afterCaptor.getValue().contains("\"isDeleted\":true"));
        assertTrue(afterCaptor.getValue().contains("\"version\":4"));
        assertTrue(afterCaptor.getValue().contains("\"updatedBy\":\"operator-1\""));
        verify(idempotencyService).markCompleted(eq("idem-1"), eq("CN"), eq("{\"code\":0,\"message\":\"SUCCESS\",\"requestId\":\"req-1\",\"data\":null,\"success\":true}"));
    }

    @Test
    @DisplayName("deleteActivity keeps operator and version increment in rejected activity audit snapshot")
    void deleteActivityRejectedSuccess() {
        DeleteActivityRequest request = buildRequest("req-2", "idem-2", "act-2", "CN", "operator-2");
        Activity activity = buildActivity("act-2", "CN", ActivityStatus.REJECTED.name(), 5, false, "old-operator");

        when(idempotencyService.checkAndRecord(eq("idem-2"), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-2")))
                .thenReturn(null);
        when(activityMapper.selectByActivityId("act-2", "CN")).thenReturn(activity);
        when(activityMapper.softDelete(eq("act-2"), eq("CN"), eq(ActivityStatus.REJECTED.name()), eq(5), anyLong(), eq("operator-2")))
                .thenReturn(1);

        activityService.deleteActivity(request);

        ArgumentCaptor<String> beforeCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> afterCaptor = ArgumentCaptor.forClass(String.class);
        verify(auditService).logStateChange(eq("req-2"), eq("operator-2"), eq("DELETE_ACTIVITY"),
                eq("Activity"), eq("act-2"), eq("CN"), beforeCaptor.capture(), afterCaptor.capture());
        assertTrue(beforeCaptor.getValue().contains("\"status\":\"REJECTED\""));
        assertTrue(beforeCaptor.getValue().contains("\"isDeleted\":false"));
        assertTrue(beforeCaptor.getValue().contains("\"version\":5"));
        assertTrue(afterCaptor.getValue().contains("\"updatedBy\":\"operator-2\""));
        assertTrue(afterCaptor.getValue().contains("\"isDeleted\":true"));
        assertTrue(afterCaptor.getValue().contains("\"version\":6"));
    }

    @Test
    @DisplayName("deleteActivity allows terminated activities to be deleted")
    void deleteActivityTerminatedSuccess() {
        DeleteActivityRequest request = buildRequest("req-3", "idem-3", "act-3", "CN", "operator-3");
        Activity activity = buildActivity("act-3", "CN", ActivityStatus.TERMINATED.name(), 1, false, "old");

        when(idempotencyService.checkAndRecord(eq("idem-3"), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-3")))
                .thenReturn(null);
        when(activityMapper.selectByActivityId("act-3", "CN")).thenReturn(activity);
        when(activityMapper.softDelete(eq("act-3"), eq("CN"), eq(ActivityStatus.TERMINATED.name()), eq(1), anyLong(), eq("operator-3")))
                .thenReturn(1);

        RpcResult<Void> result = activityService.deleteActivity(request);

        assertTrue(result.isSuccess());
        verify(activityMapper).softDelete(eq("act-3"), eq("CN"), eq(ActivityStatus.TERMINATED.name()), eq(1), anyLong(), eq("operator-3"));
    }

    @Test
    @DisplayName("deleteActivity rejects non deletable statuses with current status in message")
    void deleteActivityIllegalStates() {
        assertIllegalState(ActivityStatus.PENDING_APPROVAL.name());
        assertIllegalState(ActivityStatus.APPROVED.name());
        assertIllegalState(ActivityStatus.ONLINE.name());
        assertIllegalState(ActivityStatus.PAUSED.name());
    }

    @Test
    @DisplayName("deleteActivity returns resource not found when activity does not exist")
    void deleteActivityNotFound() {
        DeleteActivityRequest request = buildRequest("req-4", "idem-4", "act-4", "CN", "operator-4");

        when(idempotencyService.checkAndRecord(eq("idem-4"), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-4")))
                .thenReturn(null);
        when(activityMapper.selectByActivityId("act-4", "CN")).thenReturn(null);

        RpcResult<Void> result = activityService.deleteActivity(request);

        assertFalse(result.isSuccess());
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND.getCode(), result.getCode());
        assertEquals("Activity not found", result.getMessage());
        verify(activityMapper, never()).softDelete(eq("act-4"), eq("CN"), eq(ActivityStatus.DRAFT.name()), eq(0), anyLong(), eq("operator-4"));
        verifyNoInteractions(auditService);
        verify(idempotencyService, never()).markCompleted(eq("idem-4"), eq("CN"), eq(""));
    }

    @Test
    @DisplayName("deleteActivity replays cached idempotent result without extra side effects")
    void deleteActivityIdempotentReplay() {
        DeleteActivityRequest request = buildRequest("req-5", "idem-5", "act-5", "CN", "operator-5");
        RpcResult<Void> cached = RpcResult.success(null, "req-first");

        when(idempotencyService.<Void>checkAndRecord(eq("idem-5"), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-5")))
                .thenReturn(cached);

        RpcResult<Void> result = activityService.deleteActivity(request);

        assertNotNull(result);
        assertTrue(result.isSuccess());
        assertEquals("req-first", result.getRequestId());
        verifyNoInteractions(activityMapper, auditService);
        verify(idempotencyService, never()).markCompleted(eq("idem-5"), eq("CN"), eq(""));
    }

    @Test
    @DisplayName("deleteActivity returns idempotency conflict without entering delete flow")
    void deleteActivityIdempotencyConflict() {
        DeleteActivityRequest request = buildRequest("req-6", "idem-6", "act-6", "CN", "operator-6");
        RpcResult<Void> conflict = RpcResult.fail(ErrorCode.IDEMPOTENCY_CONFLICT, "Idempotency key conflict", "req-6");

        when(idempotencyService.<Void>checkAndRecord(eq("idem-6"), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-6")))
                .thenReturn(conflict);

        RpcResult<Void> result = activityService.deleteActivity(request);

        assertEquals(ErrorCode.IDEMPOTENCY_CONFLICT.getCode(), result.getCode());
        assertEquals("Idempotency key conflict", result.getMessage());
        verifyNoInteractions(activityMapper, auditService);
    }

    @Test
    @DisplayName("deleteActivity returns version conflict when concurrent delete leaves record still deletable")
    void deleteActivityConcurrentDeleteVersionConflict() {
        DeleteActivityRequest request = buildRequest("req-7", "idem-7", "act-7", "CN", "operator-7");
        Activity activity = buildActivity("act-7", "CN", ActivityStatus.DRAFT.name(), 2, false, "old");
        Activity current = buildActivity("act-7", "CN", ActivityStatus.DRAFT.name(), 2, false, "old");

        when(idempotencyService.checkAndRecord(eq("idem-7"), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-7")))
                .thenReturn(null);
        when(activityMapper.selectByActivityId("act-7", "CN")).thenReturn(activity, current);
        when(activityMapper.softDelete(eq("act-7"), eq("CN"), eq(ActivityStatus.DRAFT.name()), eq(2), anyLong(), eq("operator-7")))
                .thenReturn(0);

        RpcResult<Void> result = activityService.deleteActivity(request);

        assertEquals(ErrorCode.VERSION_CONFLICT.getCode(), result.getCode());
        assertEquals("Concurrent delete detected", result.getMessage());
        verifyNoInteractions(auditService);
        verify(idempotencyService, never()).markCompleted(eq("idem-7"), eq("CN"), eq(""));
    }

    private void assertIllegalState(String status) {
        DeleteActivityRequest request = buildRequest("req-" + status, "idem-" + status, "act-" + status, "CN", "operator");
        Activity activity = buildActivity("act-" + status, "CN", status, 0, false, "old");

        when(idempotencyService.checkAndRecord(eq("idem-" + status), eq("CN"), eq(expectedRequestHash(request)), eq(7), eq("req-" + status)))
                .thenReturn(null);
        when(activityMapper.selectByActivityId("act-" + status, "CN")).thenReturn(activity);

        RpcResult<Void> result = activityService.deleteActivity(request);

        assertEquals(ErrorCode.ILLEGAL_STATE.getCode(), result.getCode());
        assertTrue(result.getMessage().contains(status));
        verify(activityMapper, never()).softDelete(eq("act-" + status), eq("CN"), eq(status), eq(0), anyLong(), eq("operator"));
        verifyNoInteractions(auditService);
    }

    private DeleteActivityRequest buildRequest(String requestId, String idempotencyKey, String activityId,
                                               String regionCode, String operator) {
        DeleteActivityRequest request = new DeleteActivityRequest();
        request.setRequestId(requestId);
        request.setIdempotencyKey(idempotencyKey);
        request.setActivityId(activityId);
        request.setRegionCode(regionCode);
        request.setOperator(operator);
        request.setCaller("caller");
        request.setTimestampMs(1000L);
        return request;
    }

    private Activity buildActivity(String activityId, String regionCode, String status, int version,
                                   boolean isDeleted, String updatedBy) {
        Activity activity = new Activity();
        activity.setActivityId(activityId);
        activity.setRegionCode(regionCode);
        activity.setStatus(status);
        activity.setVersion(version);
        activity.setIsDeleted(isDeleted);
        activity.setUpdatedBy(updatedBy);
        activity.setUpdatedAt(123L);
        activity.setCreatedBy("creator");
        activity.setCreatedAt(100L);
        activity.setActivityName("activity-" + activityId);
        activity.setToolId("tool-1");
        activity.setToolType("FULL_REDUCE");
        activity.setTenantId("tenant-1");
        return activity;
    }

    private String expectedRequestHash(DeleteActivityRequest request) {
        return "{\"requestId\":\"" + request.getRequestId() + "\",\"caller\":\"caller\",\"operator\":\""
                + request.getOperator() + "\",\"regionCode\":\"" + request.getRegionCode()
                + "\",\"idempotencyKey\":\"" + request.getIdempotencyKey()
                + "\",\"timestampMs\":1000,\"expectedVersion\":null,\"activityId\":\""
                + request.getActivityId() + "\"}";
    }

    private String expectedBeforeJson(Activity activity) {
        return "{\"id\":null,\"activityId\":\"" + activity.getActivityId() + "\",\"tenantId\":\"tenant-1\"," +
                "\"activityName\":\"activity-" + activity.getActivityId() + "\",\"toolId\":\"tool-1\"," +
                "\"toolType\":\"FULL_REDUCE\",\"thresholdAmount\":null,\"discountAmount\":null,\"discountRate\":null," +
                "\"maxDiscount\":null,\"couponTemplateId\":null,\"status\":\"" + activity.getStatus() + "\"," +
                "\"startTime\":null,\"endTime\":null,\"scopeType\":null,\"scopeRefs\":null,\"isPurchaseLimited\":false," +
                "\"purchaseLimitPerUser\":null,\"approvalStatus\":\"NONE\",\"approverId\":null,\"approvalTime\":null," +
                "\"onlineTime\":null,\"rejectReason\":null,\"forceOfflineReason\":null,\"isDeleted\":false," +
                "\"version\":" + activity.getVersion() + ",\"regionCode\":\"CN\",\"createdAt\":100,\"updatedAt\":123," +
                "\"createdBy\":\"creator\",\"updatedBy\":\"" + activity.getUpdatedBy() + "\"}";
    }

    private String expectedAfterJson(Activity activity, String operator) {
        return "{\"id\":null,\"activityId\":\"" + activity.getActivityId() + "\",\"tenantId\":\"tenant-1\"," +
                "\"activityName\":\"activity-" + activity.getActivityId() + "\",\"toolId\":\"tool-1\"," +
                "\"toolType\":\"FULL_REDUCE\",\"thresholdAmount\":null,\"discountAmount\":null,\"discountRate\":null," +
                "\"maxDiscount\":null,\"couponTemplateId\":null,\"status\":\"" + activity.getStatus() + "\"," +
                "\"startTime\":null,\"endTime\":null,\"scopeType\":null,\"scopeRefs\":null,\"isPurchaseLimited\":false," +
                "\"purchaseLimitPerUser\":null,\"approvalStatus\":\"NONE\",\"approverId\":null,\"approvalTime\":null," +
                "\"onlineTime\":null,\"rejectReason\":null,\"forceOfflineReason\":null,\"isDeleted\":true," +
                "\"version\":" + (activity.getVersion() + 1) + ",\"regionCode\":\"CN\",\"createdAt\":100,\"updatedAt\":" + activity.getUpdatedAt() + "," +
                "\"createdBy\":\"creator\",\"updatedBy\":\"" + operator + "\"}";
    }
}
