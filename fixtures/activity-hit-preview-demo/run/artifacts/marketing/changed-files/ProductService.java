package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.*;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.Activity;
import com.ump.marketing.domain.model.ActivityScope;
import com.ump.marketing.domain.model.ScopeActivity;
import com.ump.marketing.domain.service.RuleValidator;
import com.ump.marketing.domain.service.ScopeKeyGenerator;
import com.ump.marketing.infrastructure.cache.LocalCache;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.mapper.ActivityMapper;
import com.ump.marketing.infrastructure.mapper.ActivityScopeMapper;
import com.ump.marketing.infrastructure.mapper.ScopeActivityMapper;
import com.ump.marketing.infrastructure.sharding.ShardingRouter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Application service for the Product (Scope) bounded context.
 * Handles product-to-activity binding, unbinding, and scope-based activity queries
 * against the C-end runtime (sharded) tables.
 */
@Service
public class ProductService {

    private static final String AGGREGATE_TYPE = "ActivityScope";
    private static final int IDEMPOTENCY_TTL_DAYS = 7;
    private static final String SCOPE_ACTIVITY_STATUS_ONLINE = "ONLINE";
    private static final String SCOPE_ACTIVITY_STATUS_APPROVED = "APPROVED";

    @Autowired
    private ActivityMapper activityMapper;

    @Autowired
    private ActivityScopeMapper activityScopeMapper;

    @Autowired
    private ScopeActivityMapper scopeActivityMapper;

    @Autowired
    private ShardingRouter shardingRouter;

    @Autowired
    private IdempotencyService idempotencyService;

    @Autowired
    private AuditService auditService;

    @Autowired
    private SyncEventPublisher syncEventPublisher;

    @Autowired
    private IdGenerator idGenerator;

    @Autowired
    private LocalCache localCache;

    @Autowired(required = false)
    private ObjectMapper objectMapper;

    // =========================================================================
    // 1. bindProduct
    // =========================================================================

    /**
     * Bind a product (or SKU) to an activity, creating both the B-end scope record
     * and the C-end runtime ScopeActivity record in the appropriate shard.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityScope> bindProduct(BindProductRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());
        if (req.getActivityId() == null || req.getActivityId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "activityId is required", req.getRequestId());
        }
        if (req.getProductId() == null || req.getProductId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "productId is required", req.getRequestId());
        }

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<ActivityScope> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        // Verify activity exists and is not terminated
        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }
        if (ActivityStatus.TERMINATED.name().equals(activity.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Cannot bind to a TERMINATED activity", req.getRequestId());
        }

        long now = System.currentTimeMillis();

        // Generate scope key
        String scopeKey = ScopeKeyGenerator.generateScopeKey(
                req.getRegionCode(), req.getScopeType(), req.getProductId(), req.getSkuId());

        // Create B-end ActivityScope record
        ActivityScope scope = new ActivityScope();
        scope.setActivityId(req.getActivityId());
        scope.setScopeKey(scopeKey);
        scope.setScopeType(req.getScopeType());
        scope.setProductId(req.getProductId());
        scope.setSkuId(req.getSkuId());
        scope.setRegionCode(req.getRegionCode());
        scope.setStatus("ACTIVE");
        scope.setVersion(0);
        scope.setCreatedAt(now);
        scope.setUpdatedAt(now);
        scope.setCreatedBy(req.getOperator());
        scope.setUpdatedBy(req.getOperator());

        activityScopeMapper.insert(scope);

        // Determine C-end runtime status: only ONLINE activities are visible to C-end consumers.
        // APPROVED (not yet online) activities are written so they are ready when online event arrives.
        String runtimeStatus = ActivityStatus.ONLINE.name().equals(activity.getStatus())
                ? SCOPE_ACTIVITY_STATUS_ONLINE
                : SCOPE_ACTIVITY_STATUS_APPROVED;

        // Build C-end runtime ScopeActivity record
        ScopeActivity scopeActivity = new ScopeActivity();
        scopeActivity.setScopeKey(scopeKey);
        scopeActivity.setActivityId(activity.getActivityId());
        scopeActivity.setToolId(activity.getToolId());
        scopeActivity.setToolType(activity.getToolType());
        scopeActivity.setStatus(runtimeStatus);
        scopeActivity.setThresholdAmount(activity.getThresholdAmount());
        scopeActivity.setDiscountAmount(activity.getDiscountAmount());
        scopeActivity.setDiscountRate(activity.getDiscountRate());
        scopeActivity.setMaxDiscount(activity.getMaxDiscount());
        scopeActivity.setCouponTemplateId(activity.getCouponTemplateId());
        scopeActivity.setVersion(1L);
        scopeActivity.setRegionCode(req.getRegionCode());
        scopeActivity.setCreatedAt(now);
        scopeActivity.setUpdatedAt(now);

        // Route to sharded C-end table
        String tableSuffix = shardingRouter.routeScopeActTable(req.getRegionCode(), scopeKey);
        scopeActivityMapper.insert(tableSuffix, scopeActivity);

        // Publish sync event
        String eventId = syncEventPublisher.publishEvent(
                "PRODUCT_BOUND", AGGREGATE_TYPE, scopeKey,
                req.getRegionCode(), 1L, toJson(scopeActivity));
        scopeActivity.setEventId(eventId);

        // Audit log
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "BIND_PRODUCT",
                AGGREGATE_TYPE, scopeKey, req.getRegionCode(),
                "{}", toJson(scope));

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(scope));

        return RpcResult.success(scope, req.getRequestId());
    }

    // =========================================================================
    // 2. unbindProduct
    // =========================================================================

    /**
     * Unbind a product from an activity (soft-delete the scope and remove from C-end runtime).
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<Void> unbindProduct(UnbindProductRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<Void> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }
        if (ActivityStatus.TERMINATED.name().equals(activity.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Activity is already TERMINATED", req.getRequestId());
        }

        long now = System.currentTimeMillis();

        // Find existing scope record
        String scopeKey = ScopeKeyGenerator.generateScopeKey(
                req.getRegionCode(), req.getScopeType(), req.getProductId(), req.getSkuId());
        ActivityScope existingScope = activityScopeMapper.selectByScopeKey(
                scopeKey, req.getActivityId(), req.getRegionCode());
        if (existingScope == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Scope binding not found", req.getRequestId());
        }

        String beforeJson = toJson(existingScope);

        // Soft-delete B-end scope
        activityScopeMapper.softDelete(existingScope.getId(), req.getRegionCode(), now);

        // Remove from C-end runtime sharded table
        String tableSuffix = shardingRouter.routeScopeActTable(req.getRegionCode(), scopeKey);
        scopeActivityMapper.deleteByScopeKey(tableSuffix, scopeKey, req.getActivityId(), req.getRegionCode(), now);

        // Audit log
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "UNBIND_PRODUCT",
                AGGREGATE_TYPE, scopeKey, req.getRegionCode(),
                beforeJson, "{\"status\":\"DELETED\"}");

        // Sync event to notify C-end
        long newVersion = (existingScope.getVersion() != null ? existingScope.getVersion() : 0) + 1;
        syncEventPublisher.publishEvent(
                "PRODUCT_UNBOUND", AGGREGATE_TYPE, scopeKey,
                req.getRegionCode(), newVersion,
                "{\"scopeKey\":\"" + scopeKey + "\",\"activityId\":\"" + req.getActivityId() + "\"}");

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), "{}");

        return RpcResult.success(null, req.getRequestId());
    }

    // =========================================================================
    // 3. queryActivitiesByScope
    // =========================================================================

    /**
     * Query active ONLINE activities for a given scope key from the C-end runtime sharded tables.
     * Blacklisted (force-offlined) activities are excluded.
     * Returns an empty list if C-end sync has not yet populated the runtime table (eventual consistency).
     */
    public RpcResult<List<ScopeActivityDTO>> queryActivitiesByScope(QueryScopeRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());

        String scopeKey;
        if (req.getScopeKey() != null) {
            scopeKey = req.getScopeKey();
        } else {
            // Build scope key from individual product fields
            if (req.getProductId() == null || req.getProductId().isEmpty()) {
                return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "scopeKey or productId is required", req.getRequestId());
            }
            scopeKey = ScopeKeyGenerator.generateScopeKey(
                    req.getRegionCode(), req.getScopeType(), req.getProductId(), req.getSkuId());
        }

        List<ScopeActivity> activities = queryOnlineScopeActivities(req.getRegionCode(), scopeKey);
        if (activities.isEmpty()) {
            return RpcResult.success(Collections.<ScopeActivityDTO>emptyList(), req.getRequestId());
        }

        List<ScopeActivityDTO> result = new ArrayList<ScopeActivityDTO>();
        for (ScopeActivity sa : activities) {
            result.add(convertToScopeDTO(sa));
        }

        return RpcResult.success(result, req.getRequestId());
    }

    /**
     * Queries ONLINE runtime scope activities and filters force-offline blacklist entries.
     *
     * @param regionCode region code
     * @param scopeKey scope key
     * @return visible runtime scope activities
     */
    public List<ScopeActivity> queryOnlineScopeActivities(String regionCode, String scopeKey) {
        String tableSuffix = shardingRouter.routeScopeActTable(regionCode, scopeKey);
        List<ScopeActivity> activities = scopeActivityMapper.selectActiveByScopeKey(tableSuffix, scopeKey, regionCode);
        if (activities == null || activities.isEmpty()) {
            return Collections.emptyList();
        }

        List<ScopeActivity> result = new ArrayList<ScopeActivity>();
        for (ScopeActivity activity : activities) {
            String blacklistKey = "force_offline:" + regionCode + ":" + activity.getActivityId();
            if (localCache.isMember("blacklist", blacklistKey)) {
                continue;
            }
            result.add(activity);
        }
        return result;
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private ScopeActivityDTO convertToScopeDTO(ScopeActivity sa) {
        ScopeActivityDTO dto = new ScopeActivityDTO();
        dto.setScopeKey(sa.getScopeKey());
        dto.setActivityId(sa.getActivityId());
        dto.setToolId(sa.getToolId());
        dto.setToolType(sa.getToolType());
        dto.setStatus(sa.getStatus());
        dto.setThresholdAmount(sa.getThresholdAmount());
        dto.setDiscountAmount(sa.getDiscountAmount());
        dto.setDiscountRate(sa.getDiscountRate());
        dto.setMaxDiscount(sa.getMaxDiscount());
        dto.setCouponTemplateId(sa.getCouponTemplateId());
        dto.setVersion(sa.getVersion());
        dto.setEventId(sa.getEventId());
        dto.setRegionCode(sa.getRegionCode());
        return dto;
    }

    private String toJson(Object obj) {
        if (obj == null) {
            return "null";
        }
        try {
            return objectMapper != null ? objectMapper.writeValueAsString(obj) : String.valueOf(obj);
        } catch (Exception e) {
            return String.valueOf(obj);
        }
    }
}
