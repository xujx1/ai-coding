package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.RuntimePreviewHitDTO;
import com.ump.marketing.api.dto.RuntimePreviewRequest;
import com.ump.marketing.api.dto.RuntimePreviewResponse;
import com.ump.marketing.domain.model.Activity;
import com.ump.marketing.domain.model.ActivityScope;
import com.ump.marketing.domain.model.ScopeActivity;
import com.ump.marketing.domain.model.SyncEventLog;
import com.ump.marketing.domain.service.ScopeKeyGenerator;
import com.ump.marketing.infrastructure.cache.LocalCache;
import com.ump.marketing.infrastructure.mapper.ActivityMapper;
import com.ump.marketing.infrastructure.mapper.ActivityScopeMapper;
import com.ump.marketing.infrastructure.mapper.ScopeActivityMapper;
import com.ump.marketing.infrastructure.mapper.SyncEventLogMapper;
import com.ump.marketing.infrastructure.sharding.ShardingRouter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RuntimePreviewServiceTest {

    @Mock
    private ScopeActivityMapper scopeActivityMapper;
    @Mock
    private ActivityMapper activityMapper;
    @Mock
    private ActivityScopeMapper activityScopeMapper;
    @Mock
    private SyncEventLogMapper syncEventLogMapper;
    @Mock
    private ShardingRouter shardingRouter;
    @Mock
    private LocalCache localCache;
    @Mock
    private ProductService productService;

    private RuntimePreviewService runtimePreviewService;

    @BeforeEach
    void setUp() {
        runtimePreviewService = new RuntimePreviewService(
                scopeActivityMapper,
                activityMapper,
                activityScopeMapper,
                syncEventLogMapper,
                shardingRouter,
                localCache,
                new ObjectMapper(),
                productService
        );
    }

    @Test
    @DisplayName("queryRuntimePreview uses SKU scope when skuId is present and returns a runtime hit")
    void queryRuntimePreviewSkuHit() {
        RuntimePreviewRequest request = buildRequest("req-sku", "CN", "PRODUCT", "P-100", "SKU-100", "tester");
        String scopeKey = ScopeKeyGenerator.generateScopeKey("CN", "SKU", "P-100", "SKU-100");
        ScopeActivity runtimeActivity = buildScopeActivity(
                "ACT-SKU", "CN", scopeKey, "ONLINE", "FLASH_SALE",
                new BigDecimal("100.00"), new BigDecimal("10.00"), new BigDecimal("8.50"), new BigDecimal("30.00"), "TPL-RUNTIME");
        Activity activity = buildActivity(
                "ACT-SKU", "CN", "SKU Preview Activity", "ONLINE", "FULL_REDUCE",
                new BigDecimal("200.00"), new BigDecimal("20.00"), new BigDecimal("7.50"), new BigDecimal("50.00"), "TPL-DETAIL");
        ActivityScope activityScope = buildActivityScope("ACT-SKU", scopeKey, "CN", "P-100", "SKU-100", "SKU");

        when(productService.queryOnlineScopeActivities("CN", scopeKey)).thenReturn(Collections.singletonList(runtimeActivity));
        when(shardingRouter.routeScopeActTable("CN", scopeKey)).thenReturn("03");
        when(scopeActivityMapper.selectByScopeKey("03", scopeKey, "CN")).thenReturn(Collections.singletonList(runtimeActivity));
        when(activityMapper.selectByActivityIds(Arrays.asList("ACT-SKU"), "CN")).thenReturn(Collections.singletonList(activity));
        when(activityScopeMapper.selectByScopeKeyForPreview(scopeKey, "CN")).thenReturn(Collections.singletonList(activityScope));

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(request);

        assertTrue(response.isHit());
        assertEquals("SKU", response.getMatchedDimension());
        assertEquals(scopeKey, response.getScopeKey());
        assertTrue(response.getMissReasonCodes().isEmpty());
        assertTrue(response.getSyncHints().isEmpty());
        assertEquals(1, response.getActivities().size());

        RuntimePreviewHitDTO hit = response.getActivities().get(0);
        assertEquals("ACT-SKU", hit.getActivityId());
        assertEquals("SKU Preview Activity", hit.getActivityName());
        assertEquals("ONLINE", hit.getStatus());
        assertEquals("FULL_REDUCE", hit.getToolType());
        assertEquals(new BigDecimal("200.00"), hit.getThresholdAmount());
        assertEquals(new BigDecimal("20.00"), hit.getDiscountAmount());
        assertEquals(new BigDecimal("7.50"), hit.getDiscountRate());
        assertEquals(new BigDecimal("50.00"), hit.getMaxDiscount());
        assertEquals("TPL-DETAIL", hit.getCouponTemplateId());
        assertEquals("CN", hit.getRegionCode());
        assertEquals(scopeKey, hit.getScopeKey());
        assertEquals("SKU", hit.getMatchedDimension());
        assertEquals("P-100", hit.getProductId());
        assertEquals("SKU-100", hit.getSkuId());
        assertEquals("SKU", hit.getScopeType());

        verify(productService).queryOnlineScopeActivities("CN", scopeKey);
        verify(shardingRouter).routeScopeActTable("CN", scopeKey);
    }

    @Test
    @DisplayName("queryRuntimePreview uses activity details to enrich runtime preview hits")
    void queryRuntimePreviewUsesActivityDetailsWhenAvailable() {
        RuntimePreviewRequest request = buildRequest("req-detail", "CN", "PRODUCT", "P-200", null, "tester");
        String scopeKey = ScopeKeyGenerator.generateScopeKey("CN", "PRODUCT", "P-200", null);
        ScopeActivity runtimeActivity = buildScopeActivity(
                "ACT-DETAIL", "CN", scopeKey, "ONLINE", "RUNTIME_TOOL",
                new BigDecimal("90.00"), new BigDecimal("9.00"), new BigDecimal("9.50"), new BigDecimal("15.00"), "TPL-RUNTIME");
        Activity activity = buildActivity(
                "ACT-DETAIL", "CN", "Management Detail", "PAUSED", "FULL_DISCOUNT",
                new BigDecimal("300.00"), new BigDecimal("30.00"), new BigDecimal("6.60"), new BigDecimal("80.00"), "TPL-MANAGED");
        ActivityScope activityScope = buildActivityScope("ACT-DETAIL", scopeKey, "CN", "P-200", null, "PRODUCT");

        when(productService.queryOnlineScopeActivities("CN", scopeKey)).thenReturn(Collections.singletonList(runtimeActivity));
        when(shardingRouter.routeScopeActTable("CN", scopeKey)).thenReturn("07");
        when(scopeActivityMapper.selectByScopeKey("07", scopeKey, "CN")).thenReturn(Collections.singletonList(runtimeActivity));
        when(activityMapper.selectByActivityIds(Arrays.asList("ACT-DETAIL"), "CN")).thenReturn(Collections.singletonList(activity));
        when(activityScopeMapper.selectByScopeKeyForPreview(scopeKey, "CN")).thenReturn(Collections.singletonList(activityScope));

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(request);
        RuntimePreviewHitDTO hit = response.getActivities().get(0);

        assertTrue(response.isHit());
        assertEquals("Management Detail", hit.getActivityName());
        assertEquals("PAUSED", hit.getStatus());
        assertEquals("FULL_DISCOUNT", hit.getToolType());
        assertEquals(new BigDecimal("300.00"), hit.getThresholdAmount());
        assertEquals(new BigDecimal("30.00"), hit.getDiscountAmount());
        assertEquals(new BigDecimal("6.60"), hit.getDiscountRate());
        assertEquals(new BigDecimal("80.00"), hit.getMaxDiscount());
        assertEquals("TPL-MANAGED", hit.getCouponTemplateId());
    }

    @Test
    @DisplayName("queryRuntimePreview falls back to request scope fields for product preview hits")
    void queryRuntimePreviewProductHitFallsBackToRequestScopeFields() {
        RuntimePreviewRequest request = buildRequest("req-product", "CN", "PRODUCT", "P-300", null, "tester");
        String scopeKey = ScopeKeyGenerator.generateScopeKey("CN", "PRODUCT", "P-300", null);
        ScopeActivity runtimeActivity = buildScopeActivity(
                "ACT-PRODUCT", "CN", scopeKey, "ONLINE", "FULL_REDUCE",
                new BigDecimal("120.00"), new BigDecimal("12.00"), null, null, "TPL-PRODUCT");

        when(productService.queryOnlineScopeActivities("CN", scopeKey)).thenReturn(Collections.singletonList(runtimeActivity));
        when(shardingRouter.routeScopeActTable("CN", scopeKey)).thenReturn("05");
        when(scopeActivityMapper.selectByScopeKey("05", scopeKey, "CN")).thenReturn(Collections.singletonList(runtimeActivity));
        when(activityMapper.selectByActivityIds(Arrays.asList("ACT-PRODUCT"), "CN")).thenReturn(Collections.<Activity>emptyList());
        when(activityScopeMapper.selectByScopeKeyForPreview(scopeKey, "CN")).thenReturn(Collections.<ActivityScope>emptyList());

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(request);

        assertTrue(response.isHit());
        assertEquals("PRODUCT", response.getMatchedDimension());
        assertEquals(scopeKey, response.getScopeKey());
        assertEquals(1, response.getActivities().size());

        RuntimePreviewHitDTO hit = response.getActivities().get(0);
        assertEquals("P-300", hit.getProductId());
        assertNull(hit.getSkuId());
        assertEquals("PRODUCT", hit.getScopeType());
        assertEquals(scopeKey, hit.getScopeKey());
    }

    @Test
    @DisplayName("queryRuntimePreview reports blacklisted online activities as a normal miss")
    void queryRuntimePreviewBlacklistedActivities() {
        RuntimePreviewRequest request = buildRequest("req-blacklist", "CN", "PRODUCT", "P-400", null, "tester");
        String scopeKey = ScopeKeyGenerator.generateScopeKey("CN", "PRODUCT", "P-400", null);
        ScopeActivity runtimeActivity = buildScopeActivity(
                "ACT-BLACKLIST", "CN", scopeKey, "ONLINE", "FULL_REDUCE",
                new BigDecimal("100.00"), new BigDecimal("10.00"), null, null, "TPL-BL");

        when(productService.queryOnlineScopeActivities("CN", scopeKey)).thenReturn(Collections.<ScopeActivity>emptyList());
        when(shardingRouter.routeScopeActTable("CN", scopeKey)).thenReturn("09");
        when(scopeActivityMapper.selectByScopeKey("09", scopeKey, "CN")).thenReturn(Collections.singletonList(runtimeActivity));
        when(localCache.isMember("blacklist", "force_offline:CN:ACT-BLACKLIST")).thenReturn(true);

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(request);

        assertFalse(response.isHit());
        assertTrue(response.getActivities().isEmpty());
        assertEquals(Collections.singletonList("FORCE_OFFLINE_BLACKLISTED"), response.getMissReasonCodes());
        assertTrue(response.getSyncHints().isEmpty());
        verify(localCache).isMember("blacklist", "force_offline:CN:ACT-BLACKLIST");
    }

    @Test
    @DisplayName("queryRuntimePreview reports runtime not online when only non online rows exist")
    void queryRuntimePreviewRuntimeNotOnline() {
        RuntimePreviewRequest request = buildRequest("req-not-online", "CN", "PRODUCT", "P-500", null, "tester");
        String scopeKey = ScopeKeyGenerator.generateScopeKey("CN", "PRODUCT", "P-500", null);
        ScopeActivity runtimeActivity = buildScopeActivity(
                "ACT-APPROVED", "CN", scopeKey, "APPROVED", "FULL_REDUCE",
                new BigDecimal("50.00"), new BigDecimal("5.00"), null, null, "TPL-APPROVED");

        when(productService.queryOnlineScopeActivities("CN", scopeKey)).thenReturn(Collections.<ScopeActivity>emptyList());
        when(shardingRouter.routeScopeActTable("CN", scopeKey)).thenReturn("10");
        when(scopeActivityMapper.selectByScopeKey("10", scopeKey, "CN")).thenReturn(Collections.singletonList(runtimeActivity));

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(request);

        assertFalse(response.isHit());
        assertEquals(Collections.singletonList("RUNTIME_NOT_ONLINE"), response.getMissReasonCodes());
        assertTrue(response.getSyncHints().isEmpty());
    }

    @Test
    @DisplayName("queryRuntimePreview returns sync hints when runtime data is still pending or in DLQ")
    void queryRuntimePreviewAddsSyncHints() {
        RuntimePreviewRequest request = buildRequest("req-sync", "CN", "PRODUCT", "P-600", null, "tester");
        String scopeKey = ScopeKeyGenerator.generateScopeKey("CN", "PRODUCT", "P-600", null);
        SyncEventLog syncEventLog = new SyncEventLog();
        syncEventLog.setEventType("PRODUCT_BOUND");
        syncEventLog.setConsumeStatus(SyncEventLog.STATUS_PENDING);
        syncEventLog.setRetryCount(3);
        syncEventLog.setErrorMessage("still waiting");

        when(productService.queryOnlineScopeActivities("CN", scopeKey)).thenReturn(Collections.<ScopeActivity>emptyList());
        when(shardingRouter.routeScopeActTable("CN", scopeKey)).thenReturn("11");
        when(scopeActivityMapper.selectByScopeKey("11", scopeKey, "CN")).thenReturn(Collections.<ScopeActivity>emptyList());
        when(syncEventLogMapper.selectLatestByAggregateIdAndEventType(scopeKey, "CN", "PRODUCT_BOUND")).thenReturn(syncEventLog);

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(request);

        assertFalse(response.isHit());
        assertEquals(Arrays.asList("NO_RUNTIME_MATCH", "SYNC_PENDING_OR_DLQ"), response.getMissReasonCodes());
        assertEquals(1, response.getSyncHints().size());
        assertTrue(response.getSyncHints().get(0).contains("\"consumeStatus\":\"PENDING\""));
        assertTrue(response.getSyncHints().get(0).contains("\"retryCount\":3"));
        assertTrue(response.getSyncHints().get(0).contains("\"errorMessage\":\"still waiting\""));
    }

    @Test
    @DisplayName("queryRuntimePreview returns no runtime match when runtime and sync diagnostics are absent")
    void queryRuntimePreviewNoRuntimeMatch() {
        RuntimePreviewRequest request = buildRequest("req-empty", "CN", "PRODUCT", "P-700", null, "tester");
        String scopeKey = ScopeKeyGenerator.generateScopeKey("CN", "PRODUCT", "P-700", null);

        when(productService.queryOnlineScopeActivities("CN", scopeKey)).thenReturn(Collections.<ScopeActivity>emptyList());
        when(shardingRouter.routeScopeActTable("CN", scopeKey)).thenReturn("12");
        when(scopeActivityMapper.selectByScopeKey("12", scopeKey, "CN")).thenReturn(Collections.<ScopeActivity>emptyList());
        when(syncEventLogMapper.selectLatestByAggregateIdAndEventType(scopeKey, "CN", "PRODUCT_BOUND")).thenReturn(null);

        RuntimePreviewResponse response = runtimePreviewService.queryRuntimePreview(request);

        assertFalse(response.isHit());
        assertTrue(response.getActivities().isEmpty());
        assertEquals(Collections.singletonList("NO_RUNTIME_MATCH"), response.getMissReasonCodes());
        assertTrue(response.getSyncHints().isEmpty());
    }

    private RuntimePreviewRequest buildRequest(String requestId,
                                               String regionCode,
                                               String scopeType,
                                               String productId,
                                               String skuId,
                                               String operator) {
        RuntimePreviewRequest request = new RuntimePreviewRequest();
        request.setRequestId(requestId);
        request.setRegionCode(regionCode);
        request.setScopeType(scopeType);
        request.setProductId(productId);
        request.setSkuId(skuId);
        request.setOperator(operator);
        return request;
    }

    private ScopeActivity buildScopeActivity(String activityId,
                                             String regionCode,
                                             String scopeKey,
                                             String status,
                                             String toolType,
                                             BigDecimal thresholdAmount,
                                             BigDecimal discountAmount,
                                             BigDecimal discountRate,
                                             BigDecimal maxDiscount,
                                             String couponTemplateId) {
        ScopeActivity scopeActivity = new ScopeActivity();
        scopeActivity.setActivityId(activityId);
        scopeActivity.setRegionCode(regionCode);
        scopeActivity.setScopeKey(scopeKey);
        scopeActivity.setStatus(status);
        scopeActivity.setToolId("tool-" + activityId);
        scopeActivity.setToolType(toolType);
        scopeActivity.setThresholdAmount(thresholdAmount);
        scopeActivity.setDiscountAmount(discountAmount);
        scopeActivity.setDiscountRate(discountRate);
        scopeActivity.setMaxDiscount(maxDiscount);
        scopeActivity.setCouponTemplateId(couponTemplateId);
        return scopeActivity;
    }

    private Activity buildActivity(String activityId,
                                   String regionCode,
                                   String activityName,
                                   String status,
                                   String toolType,
                                   BigDecimal thresholdAmount,
                                   BigDecimal discountAmount,
                                   BigDecimal discountRate,
                                   BigDecimal maxDiscount,
                                   String couponTemplateId) {
        Activity activity = new Activity();
        activity.setActivityId(activityId);
        activity.setRegionCode(regionCode);
        activity.setActivityName(activityName);
        activity.setStatus(status);
        activity.setToolType(toolType);
        activity.setThresholdAmount(thresholdAmount);
        activity.setDiscountAmount(discountAmount);
        activity.setDiscountRate(discountRate);
        activity.setMaxDiscount(maxDiscount);
        activity.setCouponTemplateId(couponTemplateId);
        return activity;
    }

    private ActivityScope buildActivityScope(String activityId,
                                             String scopeKey,
                                             String regionCode,
                                             String productId,
                                             String skuId,
                                             String scopeType) {
        ActivityScope activityScope = new ActivityScope();
        activityScope.setActivityId(activityId);
        activityScope.setScopeKey(scopeKey);
        activityScope.setRegionCode(regionCode);
        activityScope.setProductId(productId);
        activityScope.setSkuId(skuId);
        activityScope.setScopeType(scopeType);
        return activityScope;
    }
}
