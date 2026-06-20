package com.ump.marketing.integration;

import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.ApproveActivityRequest;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.dto.ForceOfflineRequest;
import com.ump.marketing.api.dto.OnlineActivityRequest;
import com.ump.marketing.api.dto.PauseActivityRequest;
import com.ump.marketing.api.dto.RejectActivityRequest;
import com.ump.marketing.api.dto.SubmitApprovalRequest;
import com.ump.marketing.api.dto.UpdateActivityRequest;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.Activity;
import com.ump.marketing.domain.model.SyncEvent;
import com.ump.marketing.infrastructure.config.KafkaTopicConfig;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for the full Activity lifecycle:
 * create -> submit -> approve -> online -> pause/resume -> reject -> force-offline.
 */
public class ActivityLifecycleIntegrationTest extends BaseIntegrationTest {

    @Test
    void testActivityFullLifecycle() {
        // 1. Create activity in DRAFT
        CreateActivityRequest createReq = buildCreateRequest("full-reduce-activity");
        createReq.setToolType("FULL_REDUCE");
        createReq.setThresholdAmount(new BigDecimal("100.00"));
        createReq.setDiscountAmount(new BigDecimal("20.00"));

        RpcResult<ActivityDTO> createResult = activityService.createActivity(createReq);
        assertTrue(createResult.isSuccess(), "createActivity should succeed: " + createResult.getMessage());
        assertNotNull(createResult.getData(), "createActivity should return data");
        String activityId = createResult.getData().getActivityId();
        assertNotNull(activityId, "activityId should not be null");
        assertEquals(ActivityStatus.DRAFT.name(), createResult.getData().getStatus(), "Initial status should be DRAFT");

        // Verify DRAFT status in DB
        Activity draftAct = activityMapper.selectByActivityId(activityId, REGION_CN);
        assertNotNull(draftAct);
        assertEquals(ActivityStatus.DRAFT.name(), draftAct.getStatus());

        // 2. Submit for approval -> PENDING_APPROVAL
        SubmitApprovalRequest submitReq = new SubmitApprovalRequest();
        submitReq.setRequestId("req-" + System.nanoTime());
        submitReq.setCaller(CALLER);
        submitReq.setOperator(OPERATOR);
        submitReq.setRegionCode(REGION_CN);
        submitReq.setIdempotencyKey("sub-" + System.nanoTime());
        submitReq.setTimestampMs(System.currentTimeMillis());
        submitReq.setActivityId(activityId);

        RpcResult<ActivityDTO> submitResult = activityService.submitForApproval(submitReq);
        assertTrue(submitResult.isSuccess(), "submitForApproval should succeed: " + submitResult.getMessage());
        assertEquals(ActivityStatus.PENDING_APPROVAL.name(), submitResult.getData().getStatus());

        // 3. Approve -> APPROVED
        ApproveActivityRequest approveReq = new ApproveActivityRequest();
        approveReq.setRequestId("req-" + System.nanoTime());
        approveReq.setCaller(CALLER);
        approveReq.setOperator(OPERATOR);
        approveReq.setRegionCode(REGION_CN);
        approveReq.setIdempotencyKey("appr-" + System.nanoTime());
        approveReq.setTimestampMs(System.currentTimeMillis());
        approveReq.setActivityId(activityId);
        approveReq.setApproverId("admin-1");

        RpcResult<ActivityDTO> approveResult = activityService.approveActivity(approveReq);
        assertTrue(approveResult.isSuccess(), "approveActivity should succeed: " + approveResult.getMessage());
        assertEquals(ActivityStatus.APPROVED.name(), approveResult.getData().getStatus());

        // 4. Online -> ONLINE
        OnlineActivityRequest onlineReq = new OnlineActivityRequest();
        onlineReq.setRequestId("req-" + System.nanoTime());
        onlineReq.setCaller(CALLER);
        onlineReq.setOperator(OPERATOR);
        onlineReq.setRegionCode(REGION_CN);
        onlineReq.setIdempotencyKey("onl-" + System.nanoTime());
        onlineReq.setTimestampMs(System.currentTimeMillis());
        onlineReq.setActivityId(activityId);

        RpcResult<ActivityDTO> onlineResult = activityService.onlineActivity(onlineReq);
        assertTrue(onlineResult.isSuccess(), "onlineActivity should succeed: " + onlineResult.getMessage());
        assertEquals(ActivityStatus.ONLINE.name(), onlineResult.getData().getStatus());

        // 5. Verify Kafka events were produced to the B-to-C sync topic
        List<SyncEvent> sentEvents = kafkaProducer.getSentEvents(KafkaTopicConfig.B_TO_C_SYNC_TOPIC);
        assertNotNull(sentEvents, "Sent events list should not be null");
        assertFalse(sentEvents.isEmpty(), "Kafka producer should have events after online");
    }

    @Test
    void testRejectFlow() {
        // 1. Create activity
        CreateActivityRequest createReq = buildCreateRequest("reject-test-activity");
        RpcResult<ActivityDTO> createResult = activityService.createActivity(createReq);
        assertTrue(createResult.isSuccess());
        String activityId = createResult.getData().getActivityId();

        // 2. Submit for approval
        SubmitApprovalRequest submitReq = new SubmitApprovalRequest();
        submitReq.setRequestId("req-" + System.nanoTime());
        submitReq.setCaller(CALLER);
        submitReq.setOperator(OPERATOR);
        submitReq.setRegionCode(REGION_CN);
        submitReq.setIdempotencyKey("sub-" + System.nanoTime());
        submitReq.setTimestampMs(System.currentTimeMillis());
        submitReq.setActivityId(activityId);
        RpcResult<ActivityDTO> submitResult = activityService.submitForApproval(submitReq);
        assertTrue(submitResult.isSuccess());
        assertEquals(ActivityStatus.PENDING_APPROVAL.name(), submitResult.getData().getStatus());

        // 3. Reject -> REJECTED
        RejectActivityRequest rejectReq = new RejectActivityRequest();
        rejectReq.setRequestId("req-" + System.nanoTime());
        rejectReq.setCaller(CALLER);
        rejectReq.setOperator(OPERATOR);
        rejectReq.setRegionCode(REGION_CN);
        rejectReq.setIdempotencyKey("rej-" + System.nanoTime());
        rejectReq.setTimestampMs(System.currentTimeMillis());
        rejectReq.setActivityId(activityId);
        rejectReq.setApproverId("admin-1");
        rejectReq.setReason("Does not meet quality standards");

        RpcResult<ActivityDTO> rejectResult = activityService.rejectActivity(rejectReq);
        assertTrue(rejectResult.isSuccess(), "rejectActivity should succeed: " + rejectResult.getMessage());
        assertEquals(ActivityStatus.REJECTED.name(), rejectResult.getData().getStatus());

        // 4. After rejection, the activity can be updated (REJECTED -> editable, stays DRAFT semantics)
        UpdateActivityRequest updateReq = new UpdateActivityRequest();
        updateReq.setRequestId("req-" + System.nanoTime());
        updateReq.setCaller(CALLER);
        updateReq.setOperator(OPERATOR);
        updateReq.setRegionCode(REGION_CN);
        updateReq.setIdempotencyKey("upd-" + System.nanoTime());
        updateReq.setTimestampMs(System.currentTimeMillis());
        updateReq.setActivityId(activityId);
        updateReq.setActivityName("rejected-then-updated-activity");
        updateReq.setThresholdAmount(new BigDecimal("200.00"));
        updateReq.setDiscountAmount(new BigDecimal("50.00"));

        RpcResult<ActivityDTO> updateResult = activityService.updateActivity(updateReq);
        assertTrue(updateResult.isSuccess(),
                "Updating a REJECTED activity should succeed: " + updateResult.getMessage());
        assertNotNull(updateResult.getData());
        assertEquals("rejected-then-updated-activity", updateResult.getData().getActivityName());
    }

    @Test
    void testPauseAndResume() {
        // Create -> submit -> approve -> online
        String activityId = createAndOnlineActivity("pause-resume-test");

        // 1. Pause -> PAUSED
        PauseActivityRequest pauseReq = new PauseActivityRequest();
        pauseReq.setRequestId("req-" + System.nanoTime());
        pauseReq.setCaller(CALLER);
        pauseReq.setOperator(OPERATOR);
        pauseReq.setRegionCode(REGION_CN);
        pauseReq.setIdempotencyKey("pause-" + System.nanoTime());
        pauseReq.setTimestampMs(System.currentTimeMillis());
        pauseReq.setActivityId(activityId);

        RpcResult<ActivityDTO> pauseResult = activityService.pauseActivity(pauseReq);
        assertTrue(pauseResult.isSuccess(), "pauseActivity should succeed: " + pauseResult.getMessage());
        assertEquals(ActivityStatus.PAUSED.name(), pauseResult.getData().getStatus(),
                "Status should be PAUSED after first pause call");

        // 2. Call pause again (toggle resume) -> ONLINE
        PauseActivityRequest resumeReq = new PauseActivityRequest();
        resumeReq.setRequestId("req-" + System.nanoTime());
        resumeReq.setCaller(CALLER);
        resumeReq.setOperator(OPERATOR);
        resumeReq.setRegionCode(REGION_CN);
        resumeReq.setIdempotencyKey("resume-" + System.nanoTime());
        resumeReq.setTimestampMs(System.currentTimeMillis());
        resumeReq.setActivityId(activityId);

        RpcResult<ActivityDTO> resumeResult = activityService.pauseActivity(resumeReq);
        assertTrue(resumeResult.isSuccess(), "Resuming (second pause toggle) should succeed: " + resumeResult.getMessage());
        assertEquals(ActivityStatus.ONLINE.name(), resumeResult.getData().getStatus(),
                "Status should be back to ONLINE after resume (toggle)");
    }

    @Test
    void testForceOffline() {
        // Create -> submit -> approve -> online
        String activityId = createAndOnlineActivity("force-offline-test");

        // Force offline
        ForceOfflineRequest forceReq = new ForceOfflineRequest();
        forceReq.setRequestId("req-" + System.nanoTime());
        forceReq.setCaller(CALLER);
        forceReq.setOperator(OPERATOR);
        forceReq.setRegionCode(REGION_CN);
        forceReq.setIdempotencyKey("force-" + System.nanoTime());
        forceReq.setTimestampMs(System.currentTimeMillis());
        forceReq.setActivityId(activityId);
        forceReq.setReason("emergency");

        RpcResult<Void> forceResult = activityService.forceOfflineActivity(forceReq);
        assertTrue(forceResult.isSuccess(), "forceOfflineActivity should succeed: " + forceResult.getMessage());

        // Verify blacklist cache entry
        String blacklistKey = "force_offline:" + REGION_CN + ":" + activityId;
        assertTrue(localCache.isMember("blacklist", blacklistKey),
                "Activity should be in blacklist cache after force offline");

        // Verify DB status is TERMINATED
        Activity terminated = activityMapper.selectByActivityId(activityId, REGION_CN);
        assertNotNull(terminated, "Activity should still exist in DB after force offline");
        assertEquals(ActivityStatus.TERMINATED.name(), terminated.getStatus(),
                "Activity status in DB should be TERMINATED");
    }

    /**
     * Convenience helper: creates, submits, approves, and onlines an activity, returning its activityId.
     */
    private String createAndOnlineActivity(String name) {
        CreateActivityRequest createReq = buildCreateRequest(name);
        RpcResult<ActivityDTO> createResult = activityService.createActivity(createReq);
        assertTrue(createResult.isSuccess(), "create: " + createResult.getMessage());
        String activityId = createResult.getData().getActivityId();

        SubmitApprovalRequest submitReq = new SubmitApprovalRequest();
        submitReq.setRequestId("req-" + System.nanoTime());
        submitReq.setCaller(CALLER);
        submitReq.setOperator(OPERATOR);
        submitReq.setRegionCode(REGION_CN);
        submitReq.setIdempotencyKey("sub-" + System.nanoTime());
        submitReq.setTimestampMs(System.currentTimeMillis());
        submitReq.setActivityId(activityId);
        RpcResult<ActivityDTO> submitResult = activityService.submitForApproval(submitReq);
        assertTrue(submitResult.isSuccess(), "submit: " + submitResult.getMessage());

        ApproveActivityRequest approveReq = new ApproveActivityRequest();
        approveReq.setRequestId("req-" + System.nanoTime());
        approveReq.setCaller(CALLER);
        approveReq.setOperator(OPERATOR);
        approveReq.setRegionCode(REGION_CN);
        approveReq.setIdempotencyKey("appr-" + System.nanoTime());
        approveReq.setTimestampMs(System.currentTimeMillis());
        approveReq.setActivityId(activityId);
        approveReq.setApproverId("admin-1");
        RpcResult<ActivityDTO> approveResult = activityService.approveActivity(approveReq);
        assertTrue(approveResult.isSuccess(), "approve: " + approveResult.getMessage());

        OnlineActivityRequest onlineReq = new OnlineActivityRequest();
        onlineReq.setRequestId("req-" + System.nanoTime());
        onlineReq.setCaller(CALLER);
        onlineReq.setOperator(OPERATOR);
        onlineReq.setRegionCode(REGION_CN);
        onlineReq.setIdempotencyKey("onl-" + System.nanoTime());
        onlineReq.setTimestampMs(System.currentTimeMillis());
        onlineReq.setActivityId(activityId);
        RpcResult<ActivityDTO> onlineResult = activityService.onlineActivity(onlineReq);
        assertTrue(onlineResult.isSuccess(), "online: " + onlineResult.getMessage());
        assertEquals(ActivityStatus.ONLINE.name(), onlineResult.getData().getStatus());

        return activityId;
    }
}
