package com.ump.marketing.integration;

import com.ump.marketing.api.dto.QueryScopeRequest;
import com.ump.marketing.api.dto.RuntimePreviewRequest;
import com.ump.marketing.api.dto.RuntimePreviewResponse;
import com.ump.marketing.api.dto.ScopeActivityDTO;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.RuntimePreviewService;
import com.ump.marketing.domain.model.Activity;
import com.ump.marketing.domain.model.ActivityScope;
import com.ump.marketing.domain.model.ScopeActivity;
import com.ump.marketing.domain.model.SyncEventLog;
import com.ump.marketing.domain.service.ScopeKeyGenerator;
import com.ump.marketing.infrastructure.mapper.ActivityScopeMapper;
import com.ump.marketing.infrastructure.mapper.ScopeActivityMapper;
import com.ump.marketing.infrastructure.mapper.SyncEventLogMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RuntimePreviewIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private RuntimePreviewService runtimePreviewService;

    @Autowired
    private ActivityScopeMapper activityScopeMapper;

    @Autowired
    private ScopeActivityMapper scopeActivityMapper;

    @Autowired
    private SyncEventLogMapper syncEventLogMapper;

    @Test
    @DisplayName("runtime preview isolates results by region for identical product IDs")
    void runtimePreviewRespectsRegionIsolation() {
        String productId = "preview-region-product";
        String cnScopeKey = ScopeKeyGenerator.generateScopeKey(REGION_CN, "PRODUCT", productId, null);
        String usScopeKey = ScopeKeyGenerator.generateScopeKey(REGION_US, "PRODUCT", productId, null);

        insertActivity(buildActivity("ACT-CN-PREVIEW", REGION_CN, "CN Preview Activity", "ONLINE", "FULL_REDUCE"));
        insertActivity(buildActivity("ACT-US-PREVIEW", REGION_US, "US Preview Activity", "ONLINE", "DISCOUNT"));
        insertActivityScope(buildActivityScope("ACT-CN-PREVIEW", REGION_CN, cnScopeKey, productId, null, "PRODUCT"));
        insertActivityScope(buildActivityScope("ACT-US-PREVIEW", REGION_US, usScopeKey, productId, null, "PRODUCT"));
        insertScopeActivity(buildScopeActivity("ACT-CN-PREVIEW", REGION_CN, cnScopeKey, "ONLINE", "FULL_REDUCE"));
        insertScopeActivity(buildScopeActivity("ACT-US-PREVIEW", REGION_US, usScopeKey, "ONLINE", "DISCOUNT"));

        RuntimePreviewResponse cnResponse = runtimePreviewService.queryRuntimePreview(
                buildPreviewRequest("req-cn", REGION_CN, "PRODUCT", productId, null));
        RuntimePreviewResponse usResponse = runtimePreviewService.queryRuntimePreview(
                buildPreviewRequest("req-us", REGION_US, "PRODUCT", productId, null));

        assertTrue(cnResponse.isHit());
        assertEquals(1, cnResponse.getActivities().size());
        assertEquals("ACT-CN-PREVIEW", cnResponse.getActivities().get(0).getActivityId());
        assertEquals(REGION_CN, cnResponse.getActivities().get(0).getRegionCode());

        assertTrue(usResponse.isHit());
        assertEquals(1, usResponse.getActivities().size());
        assertEquals("ACT-US-PREVIEW", usResponse.getActivities().get(0).getActivityId());
        assertEquals(REGION_US, usResponse.getActivities().get(0).getRegionCode());
    }

    @Test
    @DisplayName("runtime preview prefers SKU scope and falls back to product scope when skuId is absent")
    void runtimePreviewUsesSkuPriorityAndProductFallback() {
        String productId = "preview-scope-product";
        String skuId = "preview-sku-1";
        String skuScopeKey = ScopeKeyGenerator.generateScopeKey(REGION_CN, "SKU", productId, skuId);
        String productScopeKey = ScopeKeyGenerator.generateScopeKey(REGION_CN, "PRODUCT", productId, null);

        insertActivity(buildActivity("ACT-SKU-PRIORITY", REGION_CN, "SKU Priority Activity", "ONLINE", "FULL_REDUCE"));
        insertActivity(buildActivity("ACT-PRODUCT-FALLBACK", REGION_CN, "Product Fallback Activity", "ONLINE", "DISCOUNT"));
        insertActivityScope(buildActivityScope("ACT-SKU-PRIORITY", REGION_CN, skuScopeKey, productId, skuId, "SKU"));
        insertActivityScope(buildActivityScope("ACT-PRODUCT-FALLBACK", REGION_CN, productScopeKey, productId, null, "PRODUCT"));
        insertScopeActivity(buildScopeActivity("ACT-SKU-PRIORITY", REGION_CN, skuScopeKey, "ONLINE", "FULL_REDUCE"));
        insertScopeActivity(buildScopeActivity("ACT-PRODUCT-FALLBACK", REGION_CN, productScopeKey, "ONLINE", "DISCOUNT"));

        RuntimePreviewResponse skuResponse = runtimePreviewService.queryRuntimePreview(
                buildPreviewRequest("req-sku-priority", REGION_CN, "PRODUCT", productId, skuId));
        RuntimePreviewResponse productResponse = runtimePreviewService.queryRuntimePreview(
                buildPreviewRequest("req-product-fallback", REGION_CN, "PRODUCT", productId, null));

        assertTrue(skuResponse.isHit());
        assertEquals("SKU", skuResponse.getMatchedDimension());
        assertEquals(1, skuResponse.getActivities().size());
        assertEquals("ACT-SKU-PRIORITY", skuResponse.getActivities().get(0).getActivityId());
        assertEquals(skuId, skuResponse.getActivities().get(0).getSkuId());
        assertEquals("SKU", skuResponse.getActivities().get(0).getScopeType());

        assertTrue(productResponse.isHit());
        assertEquals("PRODUCT", productResponse.getMatchedDimension());
        assertEquals(1, productResponse.getActivities().size());
        assertEquals("ACT-PRODUCT-FALLBACK", productResponse.getActivities().get(0).getActivityId());
        assertNull(productResponse.getActivities().get(0).getSkuId());
        assertEquals("PRODUCT", productResponse.getActivities().get(0).getScopeType());
    }

    @Test
    @DisplayName("runtime preview keeps existing product scope query behavior while exposing sync diagnostics")
    void runtimePreviewAddsSyncDiagnosticsWithoutBreakingScopeQuery() {
        String productId = "preview-sync-product";
        String scopeKey = ScopeKeyGenerator.generateScopeKey(REGION_CN, "PRODUCT", productId, null);

        insertActivity(buildActivity("ACT-SYNC-DIAG", REGION_CN, "Sync Diagnostic Activity", "APPROVED", "FULL_REDUCE"));
        insertActivityScope(buildActivityScope("ACT-SYNC-DIAG", REGION_CN, scopeKey, productId, null, "PRODUCT"));
        insertScopeActivity(buildScopeActivity("ACT-SYNC-DIAG", REGION_CN, scopeKey, "APPROVED", "FULL_REDUCE"));
        insertSyncEventLog(buildSyncEventLog(scopeKey, REGION_CN, SyncEventLog.STATUS_DLQ, 2, "consumer failed"));

        QueryScopeRequest queryScopeRequest = new QueryScopeRequest();
        queryScopeRequest.setRequestId("req-scope-query");
        queryScopeRequest.setCaller(CALLER);
        queryScopeRequest.setOperator(OPERATOR);
        queryScopeRequest.setRegionCode(REGION_CN);
        queryScopeRequest.setIdempotencyKey("idem-scope-query");
        queryScopeRequest.setScopeKey(scopeKey);

        RpcResult<List<ScopeActivityDTO>> scopeQueryResult = productService.queryActivitiesByScope(queryScopeRequest);
        RuntimePreviewResponse previewResponse = runtimePreviewService.queryRuntimePreview(
                buildPreviewRequest("req-preview-sync", REGION_CN, "PRODUCT", productId, null));

        assertTrue(scopeQueryResult.isSuccess());
        assertNotNull(scopeQueryResult.getData());
        assertTrue(scopeQueryResult.getData().isEmpty());

        assertFalse(previewResponse.isHit());
        assertEquals(Collections.singletonList("RUNTIME_NOT_ONLINE"), previewResponse.getMissReasonCodes().subList(0, 1));
        assertTrue(previewResponse.getMissReasonCodes().contains("SYNC_PENDING_OR_DLQ"));
        assertEquals(1, previewResponse.getSyncHints().size());
        assertTrue(previewResponse.getSyncHints().get(0).contains("\"consumeStatus\":\"DLQ\""));
        assertTrue(previewResponse.getSyncHints().get(0).contains("\"retryCount\":2"));
    }

    @Test
    @DisplayName("runtime preview excludes force offline blacklisted activities as a normal business miss")
    void runtimePreviewHonorsBlacklistFilter() {
        String productId = "preview-blacklist-product";
        String scopeKey = ScopeKeyGenerator.generateScopeKey(REGION_CN, "PRODUCT", productId, null);

        insertActivity(buildActivity("ACT-BLACKLISTED", REGION_CN, "Blacklisted Activity", "ONLINE", "FULL_REDUCE"));
        insertActivityScope(buildActivityScope("ACT-BLACKLISTED", REGION_CN, scopeKey, productId, null, "PRODUCT"));
        insertScopeActivity(buildScopeActivity("ACT-BLACKLISTED", REGION_CN, scopeKey, "ONLINE", "FULL_REDUCE"));
        localCache.put("blacklist", "force_offline:CN:ACT-BLACKLISTED", Boolean.TRUE, 5, TimeUnit.MINUTES);

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(
                buildPreviewRequest("req-blacklisted", REGION_CN, "PRODUCT", productId, null));

        assertFalse(response.isHit());
        assertTrue(response.getActivities().isEmpty());
        assertEquals(Collections.singletonList("FORCE_OFFLINE_BLACKLISTED"), response.getMissReasonCodes());
    }

    private void insertActivity(Activity activity) {
        activityMapper.insert(activity);
    }

    private void insertActivityScope(ActivityScope activityScope) {
        activityScopeMapper.insert(activityScope);
    }

    private void insertScopeActivity(ScopeActivity scopeActivity) {
        String tableSuffix = shardingRouter.routeScopeActTable(scopeActivity.getRegionCode(), scopeActivity.getScopeKey());
        scopeActivityMapper.insert(tableSuffix, scopeActivity);
    }

    private void insertSyncEventLog(SyncEventLog syncEventLog) {
        syncEventLogMapper.insert(syncEventLog);
    }

    private RuntimePreviewRequest buildPreviewRequest(String requestId,
                                                      String regionCode,
                                                      String scopeType,
                                                      String productId,
                                                      String skuId) {
        RuntimePreviewRequest request = new RuntimePreviewRequest();
        request.setRequestId(requestId);
        request.setRegionCode(regionCode);
        request.setOperator(OPERATOR);
        request.setScopeType(scopeType);
        request.setProductId(productId);
        request.setSkuId(skuId);
        return request;
    }

    private Activity buildActivity(String activityId,
                                   String regionCode,
                                   String activityName,
                                   String status,
                                   String toolType) {
        long now = System.currentTimeMillis();
        Activity activity = new Activity();
        activity.setActivityId(activityId);
        activity.setTenantId("tenant-preview");
        activity.setActivityName(activityName);
        activity.setToolId("tool-" + activityId);
        activity.setToolType(toolType);
        activity.setThresholdAmount(new BigDecimal("100.00"));
        activity.setDiscountAmount(new BigDecimal("20.00"));
        activity.setDiscountRate(new BigDecimal("8.80"));
        activity.setMaxDiscount(new BigDecimal("50.00"));
        activity.setCouponTemplateId("tpl-" + activityId);
        activity.setStatus(status);
        activity.setStartTime(now - 1000);
        activity.setEndTime(now + 3600000);
        activity.setScopeType("PRODUCT");
        activity.setScopeRefs("[]");
        activity.setIsPurchaseLimited(false);
        activity.setPurchaseLimitPerUser(1);
        activity.setApprovalStatus("NONE");
        activity.setIsDeleted(false);
        activity.setVersion(0);
        activity.setRegionCode(regionCode);
        activity.setCreatedAt(now);
        activity.setUpdatedAt(now);
        activity.setCreatedBy(OPERATOR);
        activity.setUpdatedBy(OPERATOR);
        return activity;
    }

    private ActivityScope buildActivityScope(String activityId,
                                             String regionCode,
                                             String scopeKey,
                                             String productId,
                                             String skuId,
                                             String scopeType) {
        long now = System.currentTimeMillis();
        ActivityScope activityScope = new ActivityScope();
        activityScope.setActivityId(activityId);
        activityScope.setScopeKey(scopeKey);
        activityScope.setScopeType(scopeType);
        activityScope.setProductId(productId);
        activityScope.setSkuId(skuId);
        activityScope.setStatus("ACTIVE");
        activityScope.setRegionCode(regionCode);
        activityScope.setIsDeleted(false);
        activityScope.setVersion(0);
        activityScope.setCreatedAt(now);
        activityScope.setUpdatedAt(now);
        activityScope.setCreatedBy(OPERATOR);
        activityScope.setUpdatedBy(OPERATOR);
        return activityScope;
    }

    private ScopeActivity buildScopeActivity(String activityId,
                                             String regionCode,
                                             String scopeKey,
                                             String status,
                                             String toolType) {
        long now = System.currentTimeMillis();
        ScopeActivity scopeActivity = new ScopeActivity();
        scopeActivity.setScopeKey(scopeKey);
        scopeActivity.setActivityId(activityId);
        scopeActivity.setToolId("tool-" + activityId);
        scopeActivity.setToolType(toolType);
        scopeActivity.setStatus(status);
        scopeActivity.setThresholdAmount(new BigDecimal("100.00"));
        scopeActivity.setDiscountAmount(new BigDecimal("20.00"));
        scopeActivity.setDiscountRate(new BigDecimal("8.80"));
        scopeActivity.setMaxDiscount(new BigDecimal("50.00"));
        scopeActivity.setCouponTemplateId("tpl-" + activityId);
        scopeActivity.setRegionCode(regionCode);
        scopeActivity.setVersion(1L);
        scopeActivity.setCreatedAt(now);
        scopeActivity.setUpdatedAt(now);
        return scopeActivity;
    }

    private SyncEventLog buildSyncEventLog(String scopeKey,
                                           String regionCode,
                                           String consumeStatus,
                                           int retryCount,
                                           String errorMessage) {
        long now = System.currentTimeMillis();
        SyncEventLog syncEventLog = new SyncEventLog();
        syncEventLog.setEventId("event-" + scopeKey + "-" + consumeStatus);
        syncEventLog.setEventType("PRODUCT_BOUND");
        syncEventLog.setAggregateId(scopeKey);
        syncEventLog.setAggregateType("ActivityScope");
        syncEventLog.setRegionCode(regionCode);
        syncEventLog.setVersion(1L);
        syncEventLog.setPayload("{}");
        syncEventLog.setConsumerGroup("preview-test");
        syncEventLog.setConsumeStatus(consumeStatus);
        syncEventLog.setErrorMessage(errorMessage);
        syncEventLog.setRetryCount(retryCount);
        syncEventLog.setNextRetryAt(now + 60000L);
        syncEventLog.setOccurredAt(now);
        syncEventLog.setCreatedAt(now);
        syncEventLog.setUpdatedAt(now);
        return syncEventLog;
    }
}
