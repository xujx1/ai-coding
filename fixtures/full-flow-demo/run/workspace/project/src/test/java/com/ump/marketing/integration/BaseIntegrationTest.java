package com.ump.marketing.integration;

import com.ump.marketing.UmpMarketingApplication;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.application.service.ActivityService;
import com.ump.marketing.application.service.CouponService;
import com.ump.marketing.application.service.ProductService;
import com.ump.marketing.application.service.QuotaService;
import com.ump.marketing.application.service.SyncService;
import com.ump.marketing.domain.model.RegionCell;
import com.ump.marketing.infrastructure.cache.LocalCache;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.dlq.DlqService;
import com.ump.marketing.infrastructure.mapper.ActivityMapper;
import com.ump.marketing.infrastructure.mapper.CouponTemplateMapper;
import com.ump.marketing.infrastructure.mapper.DlqMessageMapper;
import com.ump.marketing.infrastructure.mapper.OrderOccupyMapper;
import com.ump.marketing.infrastructure.mapper.RegionCellMapper;
import com.ump.marketing.infrastructure.messaging.MockKafkaProducer;
import com.ump.marketing.infrastructure.sharding.RegionRouter;
import com.ump.marketing.infrastructure.sharding.ShardingRouter;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;

/**
 * Abstract base class for all integration tests.
 * Boots the full Spring context against an in-memory H2 database,
 * autowires core services, and ensures region cells are registered before each test.
 */
@SpringBootTest(classes = UmpMarketingApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
public abstract class BaseIntegrationTest {

    @Autowired
    protected ActivityService activityService;

    @Autowired
    protected ProductService productService;

    @Autowired
    protected CouponService couponService;

    @Autowired
    protected QuotaService quotaService;

    @Autowired
    protected SyncService syncService;

    @Autowired
    protected RegionCellMapper regionCellMapper;

    @Autowired
    protected ActivityMapper activityMapper;

    @Autowired
    protected CouponTemplateMapper couponTemplateMapper;

    @Autowired
    protected DlqMessageMapper dlqMessageMapper;

    @Autowired
    protected OrderOccupyMapper orderOccupyMapper;

    @Autowired
    protected RegionRouter regionRouter;

    @Autowired
    protected ShardingRouter shardingRouter;

    @Autowired
    protected IdGenerator idGenerator;

    @Autowired
    protected MockKafkaProducer kafkaProducer;

    @Autowired
    protected LocalCache localCache;

    @Autowired
    protected DlqService dlqService;

    protected static final String REGION_CN = "CN";
    protected static final String REGION_US = "US";
    protected static final String OPERATOR = "test-operator";
    protected static final String CALLER = "test-caller";

    @BeforeEach
    void setUp() {
        kafkaProducer.clear();
        // Register CN region cell if not already present
        try {
            regionRouter.resolve(REGION_CN);
        } catch (Exception e) {
            RegionCell cn = new RegionCell();
            cn.setRegionCode(REGION_CN);
            cn.setRegionName("China");
            cn.setDbShardKey("shard-cn");
            cn.setRedisNamespace("cn");
            cn.setKafkaTopicPrefix("cn-");
            cn.setCurrency("CNY");
            cn.setLanguage("zh-CN");
            cn.setStatus("ACTIVE");
            cn.setCreatedAt(System.currentTimeMillis());
            cn.setUpdatedAt(System.currentTimeMillis());
            cn.setCreatedBy("system");
            cn.setUpdatedBy("system");
            cn.setIsDeleted(false);
            cn.setVersion(0);
            regionCellMapper.insert(cn);
            regionRouter.registerCell(cn);
        }
        // Register US region cell if not already present
        try {
            regionRouter.resolve(REGION_US);
        } catch (Exception e) {
            RegionCell us = new RegionCell();
            us.setRegionCode(REGION_US);
            us.setRegionName("US");
            us.setDbShardKey("shard-us");
            us.setRedisNamespace("us");
            us.setKafkaTopicPrefix("us-");
            us.setCurrency("USD");
            us.setLanguage("en-US");
            us.setStatus("ACTIVE");
            us.setCreatedAt(System.currentTimeMillis());
            us.setUpdatedAt(System.currentTimeMillis());
            us.setCreatedBy("system");
            us.setUpdatedBy("system");
            us.setIsDeleted(false);
            us.setVersion(0);
            regionCellMapper.insert(us);
            regionRouter.registerCell(us);
        }
    }

    /**
     * Helper that builds a valid CreateActivityRequest with sensible defaults for FULL_REDUCE tool type.
     * Each call produces a unique idempotencyKey and requestId.
     */
    protected CreateActivityRequest buildCreateRequest(String name) {
        CreateActivityRequest req = new CreateActivityRequest();
        req.setRequestId("req-" + System.nanoTime());
        req.setCaller(CALLER);
        req.setOperator(OPERATOR);
        req.setRegionCode(REGION_CN);
        req.setIdempotencyKey("idem-" + System.nanoTime());
        req.setTimestampMs(System.currentTimeMillis());
        req.setActivityName(name);
        req.setToolId("tool-full-reduce");
        req.setToolType("FULL_REDUCE");
        req.setTenantId("tenant-001");
        req.setThresholdAmount(new BigDecimal("100.00"));
        req.setDiscountAmount(new BigDecimal("20.00"));
        req.setStartTime(System.currentTimeMillis() + 3600000L);
        req.setEndTime(System.currentTimeMillis() + 86400000L);
        req.setScopeType("ALL");
        req.setIsPurchaseLimited(false);
        req.setPurchaseLimitPerUser(1);
        return req;
    }
}
