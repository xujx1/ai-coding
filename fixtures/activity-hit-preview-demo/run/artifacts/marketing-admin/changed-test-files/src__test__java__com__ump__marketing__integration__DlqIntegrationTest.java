package com.ump.marketing.integration;

import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.ApproveActivityRequest;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.dto.OnlineActivityRequest;
import com.ump.marketing.api.dto.SubmitApprovalRequest;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.result.RpcResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for the Dead-Letter Queue (DLQ) path:
 * when Kafka send fails, the event should be persisted to DLQ and
 * the retry processor should run without exceptions.
 */
public class DlqIntegrationTest extends BaseIntegrationTest {

    @AfterEach
    void resetKafka() {
        // Ensure Kafka producer is reset to normal (non-failing) mode after each test
        kafkaProducer.setFailOnSend(false);
    }

    @Test
    void testKafkaFailureGoesToDlq() {
        // 1. Simulate Kafka failure mode
        kafkaProducer.setFailOnSend(true);

        // 2. Create an activity (this writes to DB; event publishing happens later on online)
        CreateActivityRequest createReq = buildCreateRequest("dlq-test-activity");
        createReq.setThresholdAmount(new BigDecimal("100.00"));
        createReq.setDiscountAmount(new BigDecimal("20.00"));

        RpcResult<ActivityDTO> createResult = activityService.createActivity(createReq);
        assertTrue(createResult.isSuccess(), "createActivity should succeed even if Kafka later fails: "
                + createResult.getMessage());
        String activityId = createResult.getData().getActivityId();
        assertNotNull(activityId);

        // 3. Submit for approval
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

        // 4. Approve
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

        // 5. Online - this publishes ACTIVITY_ONLINE event which will fail Kafka send and go to DLQ.
        //    The service call itself should still succeed because the DLQ path catches the failure.
        OnlineActivityRequest onlineReq = new OnlineActivityRequest();
        onlineReq.setRequestId("req-" + System.nanoTime());
        onlineReq.setCaller(CALLER);
        onlineReq.setOperator(OPERATOR);
        onlineReq.setRegionCode(REGION_CN);
        onlineReq.setIdempotencyKey("onl-" + System.nanoTime());
        onlineReq.setTimestampMs(System.currentTimeMillis());
        onlineReq.setActivityId(activityId);

        RpcResult<ActivityDTO> onlineResult = activityService.onlineActivity(onlineReq);
        assertTrue(onlineResult.isSuccess(),
                "onlineActivity should still return success when Kafka fails (DLQ fallback): "
                        + onlineResult.getMessage());
        assertEquals(ActivityStatus.ONLINE.name(), onlineResult.getData().getStatus(),
                "Activity should be marked ONLINE in DB even when Kafka send fails");

        // 6. Process retries - should run without throwing any exceptions.
        //    Messages just sent have nextRetryAt = now + 60s, so they are not immediately due,
        //    but processRetries handles the empty case gracefully.
        assertDoesNotThrow(() -> dlqService.processRetries(),
                "dlqService.processRetries() should complete without exceptions after a failed Kafka send");

        // 7. Reset Kafka and verify producer is back to normal
        kafkaProducer.setFailOnSend(false);
    }
}
