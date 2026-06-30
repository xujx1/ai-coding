package com.ump.marketing.integration;

import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.ApproveActivityRequest;
import com.ump.marketing.api.dto.BindProductRequest;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.dto.OnlineActivityRequest;
import com.ump.marketing.api.dto.QueryScopeRequest;
import com.ump.marketing.api.dto.ScopeActivityDTO;
import com.ump.marketing.api.dto.SubmitApprovalRequest;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.ActivityScope;
import com.ump.marketing.domain.service.ScopeKeyGenerator;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for product-to-activity binding and C-end scope-based queries.
 * Verifies that after binding a product/SKU to an online activity, the C-end
 * queryActivitiesByScope endpoint returns the activity with the expected scopeKey.
 */
public class ProductScopeIntegrationTest extends BaseIntegrationTest {

    @Test
    void testBindProductAndQuery() {
        // 1. Create, submit, approve, and online an activity
        String activityId = createAndOnlineActivity("product-bind-test");

        // 2. Bind product P001 / SKU S001 to the online activity
        BindProductRequest bindReq = new BindProductRequest();
        bindReq.setRequestId("req-" + System.nanoTime());
        bindReq.setCaller(CALLER);
        bindReq.setOperator(OPERATOR);
        bindReq.setRegionCode(REGION_CN);
        bindReq.setIdempotencyKey("bind-" + System.nanoTime());
        bindReq.setTimestampMs(System.currentTimeMillis());
        bindReq.setActivityId(activityId);
        bindReq.setProductId("P001");
        bindReq.setSkuId("S001");
        bindReq.setScopeType("SKU_LIST");

        RpcResult<ActivityScope> bindResult = productService.bindProduct(bindReq);
        assertTrue(bindResult.isSuccess(), "bindProduct should succeed: " + bindResult.getMessage());
        assertNotNull(bindResult.getData(), "bindProduct should return an ActivityScope");
        String scopeKey = bindResult.getData().getScopeKey();
        assertNotNull(scopeKey, "scopeKey should not be null after bind");

        // 3. Query C-end activities by scope key
        QueryScopeRequest queryReq = new QueryScopeRequest();
        queryReq.setRequestId("req-" + System.nanoTime());
        queryReq.setCaller(CALLER);
        queryReq.setOperator(OPERATOR);
        queryReq.setRegionCode(REGION_CN);
        queryReq.setIdempotencyKey("qry-" + System.nanoTime());
        queryReq.setTimestampMs(System.currentTimeMillis());
        queryReq.setScopeKey(scopeKey);

        RpcResult<List<ScopeActivityDTO>> queryResult = productService.queryActivitiesByScope(queryReq);
        assertTrue(queryResult.isSuccess(), "queryActivitiesByScope should succeed: " + queryResult.getMessage());
        assertNotNull(queryResult.getData(), "query result data should not be null");
        assertFalse(queryResult.getData().isEmpty(),
                "C-end query should return at least one activity for the bound scope");

        // 4. Verify the returned list contains our activity
        boolean found = false;
        for (ScopeActivityDTO dto : queryResult.getData()) {
            if (activityId.equals(dto.getActivityId())) {
                found = true;
                assertEquals(scopeKey, dto.getScopeKey());
                assertEquals("ONLINE", dto.getStatus());
                break;
            }
        }
        assertTrue(found, "Returned activities should contain activityId " + activityId);
    }

    @Test
    void testScopeKeyDeterministic() {
        // Two identical parameter sets must produce the same scopeKey
        String key1 = ScopeKeyGenerator.generateScopeKey(REGION_CN, "SKU_LIST", "P001", "S001");
        String key2 = ScopeKeyGenerator.generateScopeKey(REGION_CN, "SKU_LIST", "P001", "S001");
        assertNotNull(key1);
        assertEquals(16, key1.length(), "scopeKey should be 16 hex characters");
        assertEquals(key1, key2, "Identical inputs should produce the same scopeKey (deterministic)");

        // Different product IDs should produce different keys
        String key3 = ScopeKeyGenerator.generateScopeKey(REGION_CN, "SKU_LIST", "P002", "S001");
        assertNotEquals(key1, key3, "Different productIds should produce different scopeKeys");

        // Different regions should produce different keys
        String key4 = ScopeKeyGenerator.generateScopeKey(REGION_US, "SKU_LIST", "P001", "S001");
        assertNotEquals(key1, key4, "Different regionCodes should produce different scopeKeys");
    }

    /**
     * Convenience helper: creates, submits, approves, and onlines a FULL_REDUCE activity.
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
