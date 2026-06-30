package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.*;
import com.ump.marketing.api.enums.CouponStatus;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.CouponBatch;
import com.ump.marketing.domain.model.CouponInstance;
import com.ump.marketing.domain.model.CouponTemplate;
import com.ump.marketing.domain.service.RuleValidator;
import com.ump.marketing.domain.statemachine.CouponStateMachine;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.mapper.ActivityMapper;
import com.ump.marketing.infrastructure.mapper.CouponBatchMapper;
import com.ump.marketing.infrastructure.mapper.CouponInstanceMapper;
import com.ump.marketing.infrastructure.mapper.CouponTemplateMapper;
import com.ump.marketing.infrastructure.messaging.KafkaProducer;
import com.ump.marketing.infrastructure.sharding.RegionRouter;
import com.ump.marketing.infrastructure.sharding.ShardingRouter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Application service for the Coupon bounded context.
 * Handles coupon template creation, issuing, receiving, usage, and querying.
 * Coupon instances are stored in sharded tables keyed by userId.
 */
@Service
public class CouponService {

    private static final String TEMPLATE_AGGREGATE_TYPE = "CouponTemplate";
    private static final String INSTANCE_AGGREGATE_TYPE = "CouponInstance";
    private static final int IDEMPOTENCY_TTL_DAYS = 7;
    private static final String TEMPLATE_STATUS_ACTIVE = "ACTIVE";

    @Autowired
    private CouponTemplateMapper couponTemplateMapper;

    @Autowired
    private CouponBatchMapper couponBatchMapper;

    @Autowired
    private CouponInstanceMapper couponInstanceMapper;

    @Autowired
    private ActivityMapper activityMapper;

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
    private KafkaProducer kafkaProducer;

    @Autowired
    private RegionRouter regionRouter;

    @Autowired(required = false)
    private ObjectMapper objectMapper;

    // =========================================================================
    // 1. createCouponTemplate
    // =========================================================================

    /**
     * Create a new coupon template along with its first issuance batch.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<CouponTemplateDTO> createCouponTemplate(CreateCouponTemplateRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());
        RuleValidator.validateCouponTemplate(req.getFaceValue(), req.getMinAmount(), req.getTotalCount(), req.getPerUserLimit());

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<CouponTemplateDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        long now = System.currentTimeMillis();

        // Create coupon template
        CouponTemplate template = new CouponTemplate();
        template.setTemplateId(idGenerator.generateId("tpl"));
        template.setTemplateName(req.getTemplateName());
        template.setCouponType(req.getCouponType());
        template.setRegionCode(req.getRegionCode());
        template.setTotalCount(req.getTotalCount());
        template.setRemainCount(req.getTotalCount());
        template.setPerUserLimit(req.getPerUserLimit() != null ? req.getPerUserLimit() : 1);
        template.setFaceValue(req.getFaceValue());
        template.setMinAmount(req.getMinAmount());
        template.setValidStartTime(req.getValidStartTime());
        template.setValidEndTime(req.getValidEndTime());
        template.setStatus(TEMPLATE_STATUS_ACTIVE);
        template.setActivityId(req.getActivityId());
        template.setVersion(0);
        template.setCreatedAt(now);
        template.setUpdatedAt(now);
        template.setCreatedBy(req.getOperator());
        template.setUpdatedBy(req.getOperator());

        couponTemplateMapper.insert(template);

        // Create initial batch
        CouponBatch batch = new CouponBatch();
        batch.setBatchId(idGenerator.generateId("batch"));
        batch.setTemplateId(template.getTemplateId());
        batch.setBatchName("Initial batch for " + template.getTemplateName());
        batch.setRegionCode(req.getRegionCode());
        batch.setTotalCount(req.getTotalCount());
        batch.setIssuedCount(0);
        batch.setReceivedCount(0);
        batch.setUsedCount(0);
        batch.setStatus("ACTIVE");
        batch.setVersion(0);
        batch.setCreatedAt(now);
        batch.setUpdatedAt(now);
        batch.setCreatedBy(req.getOperator());
        batch.setUpdatedBy(req.getOperator());

        couponBatchMapper.insert(batch);

        String afterJson = toJson(template);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "CREATE_COUPON_TEMPLATE",
                TEMPLATE_AGGREGATE_TYPE, template.getTemplateId(), req.getRegionCode(),
                "{}", afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), afterJson);

        return RpcResult.success(toTemplateDTO(template), req.getRequestId());
    }

    // =========================================================================
    // 2. issueCoupon
    // =========================================================================

    /**
     * Issue one or more coupon instances from a template (directed issue to a specific user).
     * Atomically decrements remainCount on the template.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<List<CouponInstDTO>> issueCoupon(IssueCouponRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<List<CouponInstDTO>> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        int count = req.getCount() != null ? req.getCount() : 1;
        if (count <= 0) {
            count = 1;
        }

        CouponTemplate template = couponTemplateMapper.selectByTemplateId(
                req.getTemplateId(), req.getRegionCode());
        if (template == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Coupon template not found", req.getRequestId());
        }
        if (!TEMPLATE_STATUS_ACTIVE.equals(template.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Coupon template is not ACTIVE, current status: " + template.getStatus(),
                    req.getRequestId());
        }
        if (template.getRemainCount() < count) {
            return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                    "Insufficient coupon remainCount: " + template.getRemainCount() + " < " + count,
                    req.getRequestId());
        }

        long now = System.currentTimeMillis();

        // Atomically decrement remain count (optimistic locking)
        int oldRemain = template.getRemainCount();
        int newRemain = oldRemain - count;
        int updated = couponTemplateMapper.updateRemainCount(
                req.getTemplateId(), req.getRegionCode(),
                oldRemain, newRemain, now);
        if (updated == 0) {
            return RpcResult.fail(ErrorCode.VERSION_CONFLICT,
                    "Concurrent coupon issue, please retry", req.getRequestId());
        }

        template.setRemainCount(newRemain);

        // Determine shard table by userId
        String tableSuffix = shardingRouter.routeCouponInstTable(req.getRegionCode(), req.getUserId());

        List<CouponInstDTO> result = new ArrayList<CouponInstDTO>();
        for (int i = 0; i < count; i++) {
            CouponInstance inst = new CouponInstance();
            inst.setCouponInstId(idGenerator.generateId("cinst"));
            inst.setTemplateId(template.getTemplateId());
            inst.setBatchId(template.getTemplateId());
            inst.setUserId(req.getUserId());
            inst.setRegionCode(req.getRegionCode());
            inst.setStatus(CouponStatus.ISSUED.name());
            inst.setCouponType(template.getCouponType());
            inst.setFaceValue(template.getFaceValue());
            inst.setThresholdAmount(template.getMinAmount());
            inst.setValidStartTime(template.getValidStartTime());
            inst.setValidEndTime(template.getValidEndTime());
            inst.setActivityId(template.getActivityId());
            inst.setIssuedAt(now);
            inst.setVersion(1);
            inst.setCreatedAt(now);
            inst.setUpdatedAt(now);

            couponInstanceMapper.insert(tableSuffix, inst);

            result.add(toDTO(inst));
        }

        // Increment batch issued count
        couponBatchMapper.incrementIssuedCount(template.getTemplateId(), req.getRegionCode(), count, now);

        // Publish COUPON_ISSUED sync event(s)
        for (CouponInstDTO dto : result) {
            syncEventPublisher.publishEvent(
                    "COUPON_ISSUED", INSTANCE_AGGREGATE_TYPE, dto.getCouponInstId(),
                    req.getRegionCode(), 1L, toJson(dto));
        }

        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "ISSUE_COUPON",
                INSTANCE_AGGREGATE_TYPE, req.getUserId() + ":" + req.getTemplateId(), req.getRegionCode(),
                "{}", "{\"count\":" + count + "}");

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(result));

        return RpcResult.success(result, req.getRequestId());
    }

    // =========================================================================
    // 3. receiveCoupon
    // =========================================================================

    /**
     * Mark a coupon instance as RECEIVED (user claims it). Only ISSUED coupons can be received.
     * Enforces per-user limit.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<CouponInstDTO> receiveCoupon(ReceiveCouponRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<CouponInstDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        String tableSuffix = shardingRouter.routeCouponInstTable(req.getRegionCode(), req.getUserId());

        CouponInstance inst = couponInstanceMapper.selectByCouponInstId(
                tableSuffix, req.getCouponInstId(), req.getRegionCode());
        if (inst == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Coupon instance not found", req.getRequestId());
        }

        // Region access check
        regionRouter.assertRegionAccess(req.getRegionCode(), inst.getRegionCode());

        String currentStatus = inst.getStatus();

        if (CouponStatus.EXPIRED.name().equals(currentStatus)) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Coupon has expired", req.getRequestId());
        }

        if (!CouponStatus.ISSUED.name().equals(currentStatus)) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only ISSUED coupons can be received, current: " + currentStatus, req.getRequestId());
        }

        CouponStateMachine.assertTransition(CouponStatus.ISSUED, CouponStatus.RECEIVED);

        // Check per-user limit
        CouponTemplate template = couponTemplateMapper.selectByTemplateId(inst.getTemplateId(), req.getRegionCode());
        if (template != null) {
            int userCount = couponInstanceMapper.countByTemplateAndUser(
                    tableSuffix, inst.getTemplateId(), req.getUserId(), req.getRegionCode());
            if (userCount >= template.getPerUserLimit()) {
                return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                        "Per-user coupon limit exceeded: " + template.getPerUserLimit(),
                        req.getRequestId());
            }
        }

        long now = System.currentTimeMillis();
        String beforeJson = toJson(inst);

        int rows = couponInstanceMapper.updateStatus(
                tableSuffix, req.getCouponInstId(), req.getUserId(),
                CouponStatus.ISSUED.name(), CouponStatus.RECEIVED.name(), now, req.getRegionCode());
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Concurrent coupon receive detected", req.getRequestId());
        }

        inst.setStatus(CouponStatus.RECEIVED.name());
        inst.setReceivedAt(now);
        inst.setUpdatedAt(now);

        // Increment batch received count
        if (template != null) {
            couponBatchMapper.incrementReceivedCount(template.getTemplateId(), req.getRegionCode(), 1, now);
        }

        String afterJson = toJson(inst);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "RECEIVE_COUPON",
                INSTANCE_AGGREGATE_TYPE, inst.getCouponInstId(), req.getRegionCode(),
                beforeJson, afterJson);

        syncEventPublisher.publishEvent(
                "COUPON_RECEIVED", INSTANCE_AGGREGATE_TYPE, inst.getCouponInstId(),
                req.getRegionCode(), 1L, afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), afterJson);

        return RpcResult.success(toDTO(inst), req.getRequestId());
    }

    // =========================================================================
    // 4. useCoupon
    // =========================================================================

    /**
     * Mark a coupon instance as USED when an order is placed.
     * Key idempotency is based on orderId + couponInstId. Repeated calls with the same
     * orderId return success (idempotent use).
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<CouponInstDTO> useCoupon(UseCouponRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());
        if (req.getOrderId() == null || req.getOrderId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "orderId is required", req.getRequestId());
        }

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<CouponInstDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        String tableSuffix = shardingRouter.routeCouponInstTable(req.getRegionCode(), req.getUserId());

        CouponInstance inst = couponInstanceMapper.selectByCouponInstId(
                tableSuffix, req.getCouponInstId(), req.getRegionCode());
        if (inst == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Coupon instance not found", req.getRequestId());
        }

        regionRouter.assertRegionAccess(req.getRegionCode(), inst.getRegionCode());

        String currentStatus = inst.getStatus();

        // Already used - check if it is the same order (idempotent)
        if (CouponStatus.USED.name().equals(currentStatus)) {
            if (req.getOrderId().equals(inst.getOrderId())) {
                return RpcResult.success(toDTO(inst), req.getRequestId());
            }
            return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                    "Coupon already used with a different order", req.getRequestId());
        }

        if (!CouponStatus.RECEIVED.name().equals(currentStatus)) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only RECEIVED coupons can be used, current: " + currentStatus, req.getRequestId());
        }

        CouponStateMachine.canBeUsed(CouponStatus.RECEIVED);

        long now = System.currentTimeMillis();
        String beforeJson = toJson(inst);

        // CAS: RECEIVED -> USED, set orderId and usedAt
        int rows = couponInstanceMapper.updateStatusWithOrder(
                tableSuffix, req.getCouponInstId(), req.getUserId(),
                CouponStatus.RECEIVED.name(), CouponStatus.USED.name(),
                req.getOrderId(), now, now, req.getRegionCode());
        if (rows == 0) {
            // CAS failed - reselect to determine the reason
            CouponInstance current = couponInstanceMapper.selectByCouponInstId(
                    tableSuffix, req.getCouponInstId(), req.getRegionCode());
            if (current != null && CouponStatus.USED.name().equals(current.getStatus())
                    && req.getOrderId().equals(current.getOrderId())) {
                // Idempotent: same order already processed
                return RpcResult.success(toDTO(current), req.getRequestId());
            }
            return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                    "Coupon was used by another concurrent request", req.getRequestId());
        }

        inst.setStatus(CouponStatus.USED.name());
        inst.setOrderId(req.getOrderId());
        inst.setUsedAt(now);
        inst.setUpdatedAt(now);

        // Increment batch used count
        CouponTemplate template = couponTemplateMapper.selectByTemplateId(inst.getTemplateId(), req.getRegionCode());
        if (template != null) {
            couponBatchMapper.incrementUsedCount(template.getTemplateId(), req.getRegionCode(), 1, now);
        }

        String afterJson = toJson(inst);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "USE_COUPON",
                INSTANCE_AGGREGATE_TYPE, inst.getCouponInstId(), req.getRegionCode(),
                beforeJson, afterJson);

        syncEventPublisher.publishEvent(
                "COUPON_USED", INSTANCE_AGGREGATE_TYPE, inst.getCouponInstId(),
                req.getRegionCode(), 1L, afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), afterJson);

        return RpcResult.success(toDTO(inst), req.getRequestId());
    }

    // =========================================================================
    // 5. queryCoupon
    // =========================================================================

    /**
     * Query a single coupon instance by ID, routed to the correct shard by userId.
     */
    public RpcResult<CouponInstDTO> queryCoupon(QueryCouponRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());

        String tableSuffix = shardingRouter.routeCouponInstTable(req.getRegionCode(), req.getUserId());

        CouponInstance inst = couponInstanceMapper.selectByCouponInstId(
                tableSuffix, req.getCouponInstId(), req.getRegionCode());
        if (inst == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Coupon instance not found", req.getRequestId());
        }

        // Region access check
        regionRouter.assertRegionAccess(req.getRegionCode(), inst.getRegionCode());

        return RpcResult.success(toDTO(inst), req.getRequestId());
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private CouponInstDTO toDTO(CouponInstance c) {
        CouponInstDTO dto = new CouponInstDTO();
        dto.setCouponInstId(c.getCouponInstId());
        dto.setTemplateId(c.getTemplateId());
        dto.setBatchId(c.getBatchId());
        dto.setUserId(c.getUserId());
        dto.setRegionCode(c.getRegionCode());
        dto.setStatus(c.getStatus());
        dto.setCouponType(c.getCouponType());
        dto.setFaceValue(c.getFaceValue());
        dto.setThresholdAmount(c.getThresholdAmount());
        dto.setActivityId(c.getActivityId());
        dto.setOrderId(c.getOrderId());
        dto.setValidStartTime(c.getValidStartTime());
        dto.setValidEndTime(c.getValidEndTime());
        dto.setIssuedAt(c.getIssuedAt());
        dto.setReceivedAt(c.getReceivedAt());
        dto.setUsedAt(c.getUsedAt());
        dto.setCreatedAt(c.getCreatedAt());
        dto.setUpdatedAt(c.getUpdatedAt());
        return dto;
    }

    private CouponTemplateDTO toTemplateDTO(CouponTemplate t) {
        CouponTemplateDTO dto = new CouponTemplateDTO();
        dto.setTemplateId(t.getTemplateId());
        dto.setTemplateName(t.getTemplateName());
        dto.setCouponType(t.getCouponType());
        dto.setRegionCode(t.getRegionCode());
        dto.setTotalCount(t.getTotalCount());
        dto.setRemainCount(t.getRemainCount());
        dto.setPerUserLimit(t.getPerUserLimit());
        dto.setFaceValue(t.getFaceValue());
        dto.setMinAmount(t.getMinAmount());
        dto.setValidStartTime(t.getValidStartTime());
        dto.setValidEndTime(t.getValidEndTime());
        dto.setStatus(t.getStatus());
        dto.setActivityId(t.getActivityId());
        dto.setVersion(t.getVersion());
        dto.setCreatedAt(t.getCreatedAt());
        dto.setUpdatedAt(t.getUpdatedAt());
        dto.setCreatedBy(t.getCreatedBy());
        dto.setUpdatedBy(t.getUpdatedBy());
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
