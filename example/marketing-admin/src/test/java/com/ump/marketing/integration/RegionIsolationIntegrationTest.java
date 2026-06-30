package com.ump.marketing.integration;

import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.Activity;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests verifying region-level data isolation.
 * An activity created in one region must NOT be visible when querying with a different region code.
 */
public class RegionIsolationIntegrationTest extends BaseIntegrationTest {

    @Test
    void testRegionIsolation() {
        // 1. Create activity in CN region
        CreateActivityRequest cnCreateReq = buildCreateRequest("cn-region-activity");
        cnCreateReq.setRegionCode(REGION_CN);

        RpcResult<ActivityDTO> cnCreateResult = activityService.createActivity(cnCreateReq);
        assertTrue(cnCreateResult.isSuccess(), "CN activity creation should succeed: " + cnCreateResult.getMessage());
        String cnActivityId = cnCreateResult.getData().getActivityId();
        assertNotNull(cnActivityId);
        assertEquals(REGION_CN, cnCreateResult.getData().getRegionCode());

        // 2. Query the CN activity with regionCode=US -> should return null (SQL WHERE region_code = ?)
        Activity queriedAsUs = activityMapper.selectByActivityId(cnActivityId, REGION_US);
        assertNull(queriedAsUs,
                "CN activity should NOT be visible when querying with US region code");

        // 3. Verify it IS visible when queried with CN region code
        Activity queriedAsCn = activityMapper.selectByActivityId(cnActivityId, REGION_CN);
        assertNotNull(queriedAsCn, "CN activity should be visible when querying with CN region code");
        assertEquals(REGION_CN, queriedAsCn.getRegionCode());
        assertEquals(cnActivityId, queriedAsCn.getActivityId());

        // 4. Create a second activity in US region
        CreateActivityRequest usCreateReq = new CreateActivityRequest();
        usCreateReq.setRequestId("req-" + System.nanoTime());
        usCreateReq.setCaller(CALLER);
        usCreateReq.setOperator(OPERATOR);
        usCreateReq.setRegionCode(REGION_US);
        usCreateReq.setIdempotencyKey("idem-us-" + System.nanoTime());
        usCreateReq.setTimestampMs(System.currentTimeMillis());
        usCreateReq.setActivityName("us-region-activity");
        usCreateReq.setToolId("tool-full-reduce");
        usCreateReq.setToolType("FULL_REDUCE");
        usCreateReq.setTenantId("tenant-001");
        usCreateReq.setThresholdAmount(new BigDecimal("50.00"));
        usCreateReq.setDiscountAmount(new BigDecimal("10.00"));
        usCreateReq.setStartTime(System.currentTimeMillis() + 3600000L);
        usCreateReq.setEndTime(System.currentTimeMillis() + 86400000L);
        usCreateReq.setScopeType("ALL");
        usCreateReq.setIsPurchaseLimited(false);
        usCreateReq.setPurchaseLimitPerUser(1);

        RpcResult<ActivityDTO> usCreateResult = activityService.createActivity(usCreateReq);
        assertTrue(usCreateResult.isSuccess(), "US activity creation should succeed: " + usCreateResult.getMessage());
        String usActivityId = usCreateResult.getData().getActivityId();
        assertNotNull(usActivityId);
        assertEquals(REGION_US, usCreateResult.getData().getRegionCode());

        // 5. CN activity should NOT be visible from US region
        assertNull(activityMapper.selectByActivityId(cnActivityId, REGION_US),
                "CN activity must be invisible in US region");

        // 6. US activity should NOT be visible from CN region
        assertNull(activityMapper.selectByActivityId(usActivityId, REGION_CN),
                "US activity must be invisible in CN region");

        // 7. Each activity is visible in its own region
        assertNotNull(activityMapper.selectByActivityId(cnActivityId, REGION_CN),
                "CN activity must be visible in CN region");
        assertNotNull(activityMapper.selectByActivityId(usActivityId, REGION_US),
                "US activity must be visible in US region");

        // 8. Cross-check IDs differ (sanity)
        assertNotEquals(cnActivityId, usActivityId,
                "CN and US activities should have different IDs");
    }
}
