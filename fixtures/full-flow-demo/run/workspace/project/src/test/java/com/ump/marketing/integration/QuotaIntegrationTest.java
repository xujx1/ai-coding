package com.ump.marketing.integration;

import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.ApproveActivityRequest;
import com.ump.marketing.api.dto.ConfirmQuotaRequest;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.dto.OccupyQuotaRequest;
import com.ump.marketing.api.dto.OnlineActivityRequest;
import com.ump.marketing.api.dto.QuotaResultDTO;
import com.ump.marketing.api.dto.ReleaseQuotaRequest;
import com.ump.marketing.api.dto.SubmitApprovalRequest;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for the three-phase Quota (OrderOccupy) protocol:
 * occupy -> release -> re-occupy; occupy -> confirm; idempotent duplicate occupy.
 */
public class QuotaIntegrationTest extends BaseIntegrationTest {

    @Test
    void testOccupyReleaseOccupy() {
        // 1. Create and online a FULL_REDUCE activity
        String activityId = createAndOnlineActivity("quota-occupy-release-test");

        // 2. Occupy quota for order ORD-Q1
        OccupyQuotaRequest occupyReq = new OccupyQuotaRequest();
        occupyReq.setRequestId("req-" + System.nanoTime());
        occupyReq.setCaller(CALLER);
        occupyReq.setOperator(OPERATOR);
        occupyReq.setRegionCode(REGION_CN);
        occupyReq.setIdempotencyKey("occ-" + System.nanoTime());
        occupyReq.setTimestampMs(System.currentTimeMillis());
        occupyReq.setActivityId(activityId);
        occupyReq.setUserId("U200");
        occupyReq.setOrderId("ORD-Q1");
        occupyReq.setQuantity(1);

        RpcResult<QuotaResultDTO> occupyResult = quotaService.occupyQuota(occupyReq);
        assertTrue(occupyResult.isSuccess(), "first occupyQuota should succeed: " + occupyResult.getMessage());
        assertNotNull(occupyResult.getData());
        assertEquals("OCCUPIED", occupyResult.getData().getStatus());
        assertEquals("ORD-Q1", occupyResult.getData().getOrderId());

        // 3. Release the same quota
        ReleaseQuotaRequest releaseReq = new ReleaseQuotaRequest();
        releaseReq.setRequestId("req-" + System.nanoTime());
        releaseReq.setCaller(CALLER);
        releaseReq.setOperator(OPERATOR);
        releaseReq.setRegionCode(REGION_CN);
        releaseReq.setIdempotencyKey("rel-" + System.nanoTime());
        releaseReq.setTimestampMs(System.currentTimeMillis());
        releaseReq.setActivityId(activityId);
        releaseReq.setUserId("U200");
        releaseReq.setOrderId("ORD-Q1");

        RpcResult<QuotaResultDTO> releaseResult = quotaService.releaseQuota(releaseReq);
        assertTrue(releaseResult.isSuccess(), "releaseQuota should succeed: " + releaseResult.getMessage());
        assertNotNull(releaseResult.getData());
        assertEquals("RELEASED", releaseResult.getData().getStatus());

        // 4. Occupy again with a NEW orderId (ORD-Q2) should succeed
        OccupyQuotaRequest reOccupyReq = new OccupyQuotaRequest();
        reOccupyReq.setRequestId("req-" + System.nanoTime());
        reOccupyReq.setCaller(CALLER);
        reOccupyReq.setOperator(OPERATOR);
        reOccupyReq.setRegionCode(REGION_CN);
        reOccupyReq.setIdempotencyKey("occ2-" + System.nanoTime());
        reOccupyReq.setTimestampMs(System.currentTimeMillis());
        reOccupyReq.setActivityId(activityId);
        reOccupyReq.setUserId("U200");
        reOccupyReq.setOrderId("ORD-Q2");
        reOccupyReq.setQuantity(1);

        RpcResult<QuotaResultDTO> reOccupyResult = quotaService.occupyQuota(reOccupyReq);
        assertTrue(reOccupyResult.isSuccess(),
                "Second occupy (new orderId after release) should succeed: " + reOccupyResult.getMessage());
        assertNotNull(reOccupyResult.getData());
        assertEquals("OCCUPIED", reOccupyResult.getData().getStatus());
    }

    @Test
    void testOccupyConfirm() {
        // 1. Create and online activity
        String activityId = createAndOnlineActivity("quota-confirm-test");

        // 2. Occupy for order ORD-C1
        OccupyQuotaRequest occupyReq = new OccupyQuotaRequest();
        occupyReq.setRequestId("req-" + System.nanoTime());
        occupyReq.setCaller(CALLER);
        occupyReq.setOperator(OPERATOR);
        occupyReq.setRegionCode(REGION_CN);
        occupyReq.setIdempotencyKey("occ-" + System.nanoTime());
        occupyReq.setTimestampMs(System.currentTimeMillis());
        occupyReq.setActivityId(activityId);
        occupyReq.setUserId("U300");
        occupyReq.setOrderId("ORD-C1");
        occupyReq.setQuantity(1);

        RpcResult<QuotaResultDTO> occupyResult = quotaService.occupyQuota(occupyReq);
        assertTrue(occupyResult.isSuccess(), "occupyQuota should succeed: " + occupyResult.getMessage());
        assertEquals("OCCUPIED", occupyResult.getData().getStatus());

        // 3. Confirm -> CONFIRMED
        ConfirmQuotaRequest confirmReq = new ConfirmQuotaRequest();
        confirmReq.setRequestId("req-" + System.nanoTime());
        confirmReq.setCaller(CALLER);
        confirmReq.setOperator(OPERATOR);
        confirmReq.setRegionCode(REGION_CN);
        confirmReq.setIdempotencyKey("cfm-" + System.nanoTime());
        confirmReq.setTimestampMs(System.currentTimeMillis());
        confirmReq.setActivityId(activityId);
        confirmReq.setUserId("U300");
        confirmReq.setOrderId("ORD-C1");

        RpcResult<QuotaResultDTO> confirmResult = quotaService.confirmQuota(confirmReq);
        assertTrue(confirmResult.isSuccess(), "confirmQuota should succeed: " + confirmResult.getMessage());
        assertNotNull(confirmResult.getData());
        assertEquals("CONFIRMED", confirmResult.getData().getStatus());

        // 4. Release after confirm should fail with BUSINESS_CONFLICT
        ReleaseQuotaRequest releaseReq = new ReleaseQuotaRequest();
        releaseReq.setRequestId("req-" + System.nanoTime());
        releaseReq.setCaller(CALLER);
        releaseReq.setOperator(OPERATOR);
        releaseReq.setRegionCode(REGION_CN);
        releaseReq.setIdempotencyKey("rel-" + System.nanoTime());
        releaseReq.setTimestampMs(System.currentTimeMillis());
        releaseReq.setActivityId(activityId);
        releaseReq.setUserId("U300");
        releaseReq.setOrderId("ORD-C1");

        RpcResult<QuotaResultDTO> releaseResult = quotaService.releaseQuota(releaseReq);
        assertFalse(releaseResult.isSuccess(),
                "Releasing a CONFIRMED quota should fail with BUSINESS_CONFLICT");
        assertEquals(ErrorCode.BUSINESS_CONFLICT.getCode(), releaseResult.getCode(),
                "Error code should be BUSINESS_CONFLICT for releasing confirmed quota");
    }

    @Test
    void testDuplicateOccupyIsIdempotent() {
        // 1. Create and online activity
        String activityId = createAndOnlineActivity("quota-idempotent-test");

        String idemKey = "occ-idem-" + System.nanoTime();

        // 2. First occupy
        OccupyQuotaRequest occupyReq1 = new OccupyQuotaRequest();
        occupyReq1.setRequestId("req-" + System.nanoTime());
        occupyReq1.setCaller(CALLER);
        occupyReq1.setOperator(OPERATOR);
        occupyReq1.setRegionCode(REGION_CN);
        occupyReq1.setIdempotencyKey(idemKey);
        occupyReq1.setTimestampMs(System.currentTimeMillis());
        occupyReq1.setActivityId(activityId);
        occupyReq1.setUserId("U400");
        occupyReq1.setOrderId("ORD-D1");
        occupyReq1.setQuantity(1);

        RpcResult<QuotaResultDTO> result1 = quotaService.occupyQuota(occupyReq1);
        assertTrue(result1.isSuccess(), "first occupy should succeed: " + result1.getMessage());
        assertEquals("OCCUPIED", result1.getData().getStatus());

        // 3. Second occupy with the SAME idempotencyKey -> idempotent, returns same result
        OccupyQuotaRequest occupyReq2 = new OccupyQuotaRequest();
        occupyReq2.setRequestId("req-" + System.nanoTime());
        occupyReq2.setCaller(CALLER);
        occupyReq2.setOperator(OPERATOR);
        occupyReq2.setRegionCode(REGION_CN);
        occupyReq2.setIdempotencyKey(idemKey); // same idempotency key
        occupyReq2.setTimestampMs(System.currentTimeMillis());
        occupyReq2.setActivityId(activityId);
        occupyReq2.setUserId("U400");
        occupyReq2.setOrderId("ORD-D1");
        occupyReq2.setQuantity(1);

        RpcResult<QuotaResultDTO> result2 = quotaService.occupyQuota(occupyReq2);
        assertTrue(result2.isSuccess(),
                "Duplicate occupy with same idempotencyKey should succeed (idempotent)");
        assertNotNull(result2.getData());
        assertEquals("OCCUPIED", result2.getData().getStatus(),
                "Duplicate occupy should still report OCCUPIED status");
    }

    /**
     * Creates, submits, approves, and onlines a FULL_REDUCE activity.
     */
    private String createAndOnlineActivity(String name) {
        CreateActivityRequest createReq = buildCreateRequest(name);
        createReq.setThresholdAmount(new BigDecimal("100.00"));
        createReq.setDiscountAmount(new BigDecimal("20.00"));

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
