package com.ump.marketing.integration;

import com.ump.marketing.api.dto.PreviewActivityDTO;
import com.ump.marketing.api.dto.PreviewHintDTO;
import com.ump.marketing.api.dto.PreviewQueryRequest;
import com.ump.marketing.api.dto.PreviewResponseDTO;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.PreviewService;
import com.ump.marketing.infrastructure.client.MarketingRuntimePreviewClient;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewResponse;
import com.ump.marketing.infrastructure.mapper.PreviewQueryMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class ActivityPreviewIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private PreviewQueryMapper previewQueryMapper;

    @Autowired
    private PreviewService previewService;

    @MockBean
    private MarketingRuntimePreviewClient marketingRuntimePreviewClient;

    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUpPreviewTables() {
        jdbcTemplate = new JdbcTemplate(dataSource);
        jdbcTemplate.update("DELETE FROM t_activity_scope");
        jdbcTemplate.update("DELETE FROM t_activity");
    }

    @Test
    @DisplayName("selectActivities returns only undeleted same-region product bindings ordered by status")
    void selectActivitiesProductQueryFiltersAndOrders() {
        insertActivity("act-online", REGION_CN, "ONLINE", false, 5000L,
                "100.00", "20.00", "0.80", "30.00", "coupon-1");
        insertScope("scope-online", "act-online", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-approved", REGION_CN, "APPROVED", false, 4000L,
                "120.00", "25.00", "0.75", "35.00", "coupon-2");
        insertScope("scope-approved", "act-approved", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-paused", REGION_CN, "PAUSED", false, 3000L,
                "150.00", "30.00", "0.70", "40.00", "coupon-3");
        insertScope("scope-paused", "act-paused", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-deleted", REGION_CN, "ONLINE", true, 6000L,
                "90.00", "10.00", "0.90", "15.00", "coupon-4");
        insertScope("scope-deleted", "act-deleted", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-cross-region", REGION_US, "ONLINE", false, 7000L,
                "80.00", "8.00", "0.95", "12.00", "coupon-5");
        insertScope("scope-cross-region", "act-cross-region", REGION_US, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-scope-deleted", REGION_CN, "ONLINE", false, 8000L,
                "70.00", "7.00", "0.96", "11.00", "coupon-6");
        insertScope("scope-scope-deleted", "act-scope-deleted", REGION_CN, "product-1", null, "PRODUCT_LIST", true);

        List<PreviewActivityDTO> activities = previewQueryMapper.selectActivities(
                REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        assertEquals(Arrays.asList("act-online", "act-approved", "act-paused"), activityIds(activities));
        PreviewActivityDTO first = activities.get(0);
        assertEquals("ONLINE", first.getStatus());
        assertEquals("FULL_REDUCE", first.getToolType());
        assertEquals(new BigDecimal("100.00"), first.getThresholdAmount());
        assertEquals(new BigDecimal("20.00"), first.getDiscountAmount());
        assertEquals(new BigDecimal("0.80"), first.getDiscountRate());
        assertEquals(new BigDecimal("30.00"), first.getMaxDiscount());
        assertEquals("coupon-1", first.getCouponTemplateId());
        assertEquals(REGION_CN, first.getRegionCode());
        assertEquals("product-1", first.getProductId());
        assertNull(first.getSkuId());
        assertEquals("PRODUCT_LIST", first.getScopeType());
    }

    @Test
    @DisplayName("selectActivities prefers exact sku bindings and falls back to product bindings per activity")
    void selectActivitiesSkuQueryPrefersExactSku() {
        insertActivity("act-sku-specific", REGION_CN, "ONLINE", false, 5000L,
                "100.00", "20.00", "0.80", "30.00", "coupon-1");
        insertScope("scope-sku-exact", "act-sku-specific", REGION_CN, "product-1", "sku-1", "SKU_LIST", false);
        insertScope("scope-sku-fallback-hidden", "act-sku-specific", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-product-fallback", REGION_CN, "APPROVED", false, 4000L,
                "120.00", "25.00", "0.75", "35.00", "coupon-2");
        insertScope("scope-product-fallback", "act-product-fallback", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-other-sku", REGION_CN, "ONLINE", false, 3000L,
                "130.00", "28.00", "0.72", "38.00", "coupon-3");
        insertScope("scope-other-sku", "act-other-sku", REGION_CN, "product-1", "sku-2", "SKU_LIST", false);

        insertActivity("act-deleted-sku", REGION_CN, "ONLINE", true, 2000L,
                "140.00", "29.00", "0.71", "39.00", "coupon-4");
        insertScope("scope-deleted-sku", "act-deleted-sku", REGION_CN, "product-1", "sku-1", "SKU_LIST", false);

        List<PreviewActivityDTO> activities = previewQueryMapper.selectActivities(
                REGION_CN, "product-1", "sku-1", null, true);

        assertEquals(Arrays.asList("act-sku-specific", "act-product-fallback"), activityIds(activities));
        assertEquals("sku-1", activities.get(0).getSkuId());
        assertNull(activities.get(1).getSkuId());
    }

    @Test
    @DisplayName("selectActivities respects scope type filter and returns empty when no valid binding matches")
    void selectActivitiesScopeTypeFilterAndEmptyResult() {
        insertActivity("act-product-only", REGION_CN, "ONLINE", false, 5000L,
                "100.00", "20.00", "0.80", "30.00", "coupon-1");
        insertScope("scope-product-only", "act-product-only", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-invalid-sku-filter", REGION_CN, "ONLINE", false, 4000L,
                "110.00", "21.00", "0.79", "31.00", "coupon-2");
        insertScope("scope-invalid-sku-filter", "act-invalid-sku-filter", REGION_CN, "product-1", null, "SKU_LIST", true);

        List<PreviewActivityDTO> activities = previewQueryMapper.selectActivities(
                REGION_CN, "product-1", null, "SKU_LIST", false);

        assertTrue(activities.isEmpty());
    }

    @Test
    @DisplayName("previewService uses real mapper results and adds diff hints when runtime side misses")
    void previewServiceIntegrationBuildsManagementResult() {
        insertActivity("act-online", REGION_CN, "ONLINE", false, 5000L,
                "100.00", "20.00", "0.80", "30.00", "coupon-1");
        insertScope("scope-online", "act-online", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        insertActivity("act-approved", REGION_CN, "APPROVED", false, 4000L,
                "120.00", "25.00", "0.75", "35.00", "coupon-2");
        insertScope("scope-approved", "act-approved", REGION_CN, "product-1", null, "PRODUCT_LIST", false);

        RuntimePreviewResponse runtimeResponse = new RuntimePreviewResponse();
        runtimeResponse.setAvailable(Boolean.TRUE);
        runtimeResponse.setHit(Boolean.FALSE);
        runtimeResponse.setSummary("runtime miss");
        runtimeResponse.setReasonMessage("活动未上线或尚未生效");
        when(marketingRuntimePreviewClient.preview(any())).thenReturn(runtimeResponse);

        RpcResult<PreviewResponseDTO> result = previewService.previewActivityHit(buildRequest("product-1", null, "PRODUCT_LIST"));

        assertTrue(result.isSuccess());
        assertEquals(Arrays.asList("act-online", "act-approved"),
                activityIds(result.getData().getManagementResult().getActivities()));
        assertTrue(result.getData().getManagementResult().getHit());
        assertFalse(result.getData().getRuntimeResult().getHit());
        assertEquals("PRODUCT", result.getData().getQuerySummary().getQueryMode());
        assertEquals("MANAGEMENT", result.getData().getManagementResult().getActivities().get(0).getSourceSide());
        assertTrue(containsHintCode(result.getData().getDiffHints(), "CONFIG_RUNTIME_DIFF"));
    }

    private PreviewQueryRequest buildRequest(String productId, String skuId, String scopeType) {
        PreviewQueryRequest request = new PreviewQueryRequest();
        request.setRequestId("req-preview");
        request.setCaller(CALLER);
        request.setOperator(OPERATOR);
        request.setRegionCode(REGION_CN);
        request.setIdempotencyKey("idem-preview");
        request.setTimestampMs(System.currentTimeMillis());
        request.setProductId(productId);
        request.setSkuId(skuId);
        request.setScopeType(scopeType);
        return request;
    }

    private void insertActivity(String activityId,
                                String regionCode,
                                String status,
                                boolean deleted,
                                long updatedAt,
                                String thresholdAmount,
                                String discountAmount,
                                String discountRate,
                                String maxDiscount,
                                String couponTemplateId) {
        long startTime = 1700000000000L;
        long endTime = 1700003600000L;
        jdbcTemplate.update(
                "INSERT INTO t_activity (activity_id, tenant_id, activity_name, tool_id, tool_type, threshold_amount, discount_amount, discount_rate, max_discount, coupon_template_id, status, start_time, end_time, scope_type, is_deleted, version, region_code, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                activityId,
                "tenant-1",
                "activity-" + activityId,
                "tool-1",
                "FULL_REDUCE",
                new BigDecimal(thresholdAmount),
                new BigDecimal(discountAmount),
                new BigDecimal(discountRate),
                new BigDecimal(maxDiscount),
                couponTemplateId,
                status,
                startTime,
                endTime,
                "ALL",
                deleted ? 1 : 0,
                0,
                regionCode,
                updatedAt - 1000L,
                updatedAt,
                OPERATOR,
                OPERATOR
        );
    }

    private void insertScope(String scopeKey,
                             String activityId,
                             String regionCode,
                             String productId,
                             String skuId,
                             String scopeType,
                             boolean deleted) {
        long now = System.currentTimeMillis();
        jdbcTemplate.update(
                "INSERT INTO t_activity_scope (scope_key, activity_id, product_id, sku_id, scope_type, status, is_deleted, version, region_code, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                scopeKey,
                activityId,
                productId,
                skuId,
                scopeType,
                "ACTIVE",
                deleted ? 1 : 0,
                0,
                regionCode,
                now,
                now,
                OPERATOR,
                OPERATOR
        );
    }

    private List<String> activityIds(List<PreviewActivityDTO> activities) {
        List<String> ids = new ArrayList<>();
        for (PreviewActivityDTO activity : activities) {
            ids.add(activity.getActivityId());
        }
        return ids;
    }

    private boolean containsHintCode(List<PreviewHintDTO> hints, String code) {
        for (PreviewHintDTO hint : hints) {
            if (code.equals(hint.getCode())) {
                return true;
            }
        }
        return false;
    }
}
