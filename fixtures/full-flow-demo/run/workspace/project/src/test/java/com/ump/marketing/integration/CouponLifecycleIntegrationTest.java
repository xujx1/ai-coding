package com.ump.marketing.integration;

import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.ApproveActivityRequest;
import com.ump.marketing.api.dto.CouponInstDTO;
import com.ump.marketing.api.dto.CouponTemplateDTO;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.dto.CreateCouponTemplateRequest;
import com.ump.marketing.api.dto.IssueCouponRequest;
import com.ump.marketing.api.dto.OnlineActivityRequest;
import com.ump.marketing.api.dto.ReceiveCouponRequest;
import com.ump.marketing.api.dto.SubmitApprovalRequest;
import com.ump.marketing.api.dto.UseCouponRequest;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.enums.CouponStatus;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for the full Coupon lifecycle:
 * create template -> issue -> receive -> use -> idempotent repeat use -> reject double-use with different order.
 */
public class CouponLifecycleIntegrationTest extends BaseIntegrationTest {

    @Test
    void testFullCouponLifecycle() {
        // 1. Create an activity with toolType=COUPON and bring it online
        CreateActivityRequest createReq = buildCreateRequest("coupon-activity");
        createReq.setToolId("tool-coupon");
        createReq.setToolType("COUPON");
        createReq.setThresholdAmount(new BigDecimal("100.00"));
        createReq.setDiscountAmount(new BigDecimal("20.00"));

        RpcResult<ActivityDTO> createResult = activityService.createActivity(createReq);
        assertTrue(createResult.isSuccess(), "createActivity should succeed: " + createResult.getMessage());
        String activityId = createResult.getData().getActivityId();
        assertNotNull(activityId);

        // Submit -> approve -> online
        submitApproveOnline(activityId);

        // 2. Create coupon template linked to the activity
        long now = System.currentTimeMillis();
        CreateCouponTemplateRequest tplReq = new CreateCouponTemplateRequest();
        tplReq.setRequestId("req-" + System.nanoTime());
        tplReq.setCaller(CALLER);
        tplReq.setOperator(OPERATOR);
        tplReq.setRegionCode(REGION_CN);
        tplReq.setIdempotencyKey("tpl-" + System.nanoTime());
        tplReq.setTimestampMs(now);
        tplReq.setTemplateName("满100减20券");
        tplReq.setCouponType("FULL_REDUCE");
        tplReq.setFaceValue(new BigDecimal("20.00"));
        tplReq.setMinAmount(new BigDecimal("100.00"));
        tplReq.setTotalCount(100);
        tplReq.setPerUserLimit(1);
        tplReq.setValidStartTime(now);
        tplReq.setValidEndTime(now + 7L * 24 * 60 * 60 * 1000); // +7 days
        tplReq.setActivityId(activityId);

        RpcResult<CouponTemplateDTO> tplResult = couponService.createCouponTemplate(tplReq);
        assertTrue(tplResult.isSuccess(), "createCouponTemplate should succeed: " + tplResult.getMessage());
        assertNotNull(tplResult.getData());
        String templateId = tplResult.getData().getTemplateId();
        assertNotNull(templateId, "templateId should not be null");
        assertEquals("ACTIVE", tplResult.getData().getStatus());

        // 3. Issue a coupon instance to user U100
        IssueCouponRequest issueReq = new IssueCouponRequest();
        issueReq.setRequestId("req-" + System.nanoTime());
        issueReq.setCaller(CALLER);
        issueReq.setOperator(OPERATOR);
        issueReq.setRegionCode(REGION_CN);
        issueReq.setIdempotencyKey("issue-" + System.nanoTime());
        issueReq.setTimestampMs(System.currentTimeMillis());
        issueReq.setTemplateId(templateId);
        issueReq.setUserId("U100");
        issueReq.setCount(1);

        RpcResult<List<CouponInstDTO>> issueResult = couponService.issueCoupon(issueReq);
        assertTrue(issueResult.isSuccess(), "issueCoupon should succeed: " + issueResult.getMessage());
        assertNotNull(issueResult.getData());
        assertFalse(issueResult.getData().isEmpty(), "issueCoupon should return at least one coupon instance");
        String couponInstId = issueResult.getData().get(0).getCouponInstId();
        assertNotNull(couponInstId, "couponInstId should not be null");
        assertEquals(CouponStatus.ISSUED.name(), issueResult.getData().get(0).getStatus());

        // 4. Receive coupon (user claims it)
        ReceiveCouponRequest recvReq = new ReceiveCouponRequest();
        recvReq.setRequestId("req-" + System.nanoTime());
        recvReq.setCaller(CALLER);
        recvReq.setOperator(OPERATOR);
        recvReq.setRegionCode(REGION_CN);
        recvReq.setIdempotencyKey("recv-" + System.nanoTime());
        recvReq.setTimestampMs(System.currentTimeMillis());
        recvReq.setCouponInstId(couponInstId);
        recvReq.setUserId("U100");

        RpcResult<CouponInstDTO> recvResult = couponService.receiveCoupon(recvReq);
        assertTrue(recvResult.isSuccess(), "receiveCoupon should succeed: " + recvResult.getMessage());
        assertNotNull(recvResult.getData());
        assertEquals(CouponStatus.RECEIVED.name(), recvResult.getData().getStatus());

        // 5. Use coupon (place order ORD001)
        UseCouponRequest useReq = new UseCouponRequest();
        useReq.setRequestId("req-" + System.nanoTime());
        useReq.setCaller(CALLER);
        useReq.setOperator(OPERATOR);
        useReq.setRegionCode(REGION_CN);
        useReq.setIdempotencyKey("use-" + System.nanoTime());
        useReq.setTimestampMs(System.currentTimeMillis());
        useReq.setCouponInstId(couponInstId);
        useReq.setUserId("U100");
        useReq.setOrderId("ORD001");
        useReq.setActivityId(activityId);
        useReq.setUsedAmount(new BigDecimal("20.00"));

        RpcResult<CouponInstDTO> useResult = couponService.useCoupon(useReq);
        assertTrue(useResult.isSuccess(), "useCoupon should succeed: " + useResult.getMessage());
        assertNotNull(useResult.getData());
        assertEquals(CouponStatus.USED.name(), useResult.getData().getStatus());
        assertEquals("ORD001", useResult.getData().getOrderId());

        // 6. Use coupon AGAIN with the same orderId -> idempotent success (not an error)
        UseCouponRequest repeatUseReq = new UseCouponRequest();
        repeatUseReq.setRequestId("req-" + System.nanoTime());
        repeatUseReq.setCaller(CALLER);
        repeatUseReq.setOperator(OPERATOR);
        repeatUseReq.setRegionCode(REGION_CN);
        repeatUseReq.setIdempotencyKey("use-repeat-" + System.nanoTime()); // different idem key -> exercises business logic
        repeatUseReq.setTimestampMs(System.currentTimeMillis());
        repeatUseReq.setCouponInstId(couponInstId);
        repeatUseReq.setUserId("U100");
        repeatUseReq.setOrderId("ORD001"); // same orderId
        repeatUseReq.setActivityId(activityId);
        repeatUseReq.setUsedAmount(new BigDecimal("20.00"));

        RpcResult<CouponInstDTO> repeatUseResult = couponService.useCoupon(repeatUseReq);
        assertTrue(repeatUseResult.isSuccess(),
                "Repeated useCoupon with the same orderId should be idempotent and succeed");
        assertNotNull(repeatUseResult.getData());
        assertEquals(CouponStatus.USED.name(), repeatUseResult.getData().getStatus());

        // 7. Try use with a DIFFERENT orderId on same coupon instance -> BUSINESS_CONFLICT
        UseCouponRequest doubleUseReq = new UseCouponRequest();
        doubleUseReq.setRequestId("req-" + System.nanoTime());
        doubleUseReq.setCaller(CALLER);
        doubleUseReq.setOperator(OPERATOR);
        doubleUseReq.setRegionCode(REGION_CN);
        doubleUseReq.setIdempotencyKey("use-dbl-" + System.nanoTime());
        doubleUseReq.setTimestampMs(System.currentTimeMillis());
        doubleUseReq.setCouponInstId(couponInstId);
        doubleUseReq.setUserId("U100");
        doubleUseReq.setOrderId("ORD002"); // different orderId
        doubleUseReq.setActivityId(activityId);
        doubleUseReq.setUsedAmount(new BigDecimal("20.00"));

        RpcResult<CouponInstDTO> doubleUseResult = couponService.useCoupon(doubleUseReq);
        assertFalse(doubleUseResult.isSuccess(),
                "Using an already-used coupon with a different orderId should fail");
        assertEquals(ErrorCode.BUSINESS_CONFLICT.getCode(), doubleUseResult.getCode(),
                "Error code should be BUSINESS_CONFLICT for double-use with different order");
    }

    /**
     * Submit -> approve -> online a previously-created activity (by activityId).
     */
    private void submitApproveOnline(String activityId) {
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
    }
}
