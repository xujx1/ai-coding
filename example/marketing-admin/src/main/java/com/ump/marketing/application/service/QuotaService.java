package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.*;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.OrderOccupy;
import com.ump.marketing.domain.service.RuleValidator;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.mapper.OrderOccupyMapper;
import com.ump.marketing.infrastructure.sharding.ShardingRouter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Application service for the Quota (Order Occupy) bounded context.
 * Handles the three-phase quota protocol: occupy (pre-freeze on order placement),
 * release (on order cancel/timeout), and confirm (on payment success).
 * OrderOccupy records are stored in sharded tables keyed by orderId.
 */
@Service
public class QuotaService {

    private static final String AGGREGATE_TYPE = "OrderOccupy";
    private static final int IDEMPOTENCY_TTL_DAYS = 3;

    private static final String STATUS_OCCUPIED = "OCCUPIED";
    private static final String STATUS_CONFIRMED = "CONFIRMED";
    private static final String STATUS_RELEASED = "RELEASED";

    @Autowired
    private OrderOccupyMapper orderOccupyMapper;

    @Autowired
    private ShardingRouter shardingRouter;

    @Autowired
    private IdempotencyService idempotencyService;

    @Autowired
    private AuditService auditService;

    @Autowired
    private IdGenerator idGenerator;

    @Autowired(required = false)
    private ObjectMapper objectMapper;

    // =========================================================================
    // 1. occupyQuota
    // =========================================================================

    /**
     * Occupy (pre-freeze) quota for an order. Idempotent on orderId + userId + activityId.
     * If an existing OCCUPIED or CONFIRMED record exists, returns it as-is.
     * If a RELEASED record exists, it is transitioned back to OCCUPIED.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<QuotaResultDTO> occupyQuota(OccupyQuotaRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());
        if (req.getOrderId() == null || req.getOrderId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "orderId is required", req.getRequestId());
        }
        if (req.getActivityId() == null || req.getActivityId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "activityId is required", req.getRequestId());
        }

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<QuotaResultDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            if (cached.isSuccess()) {
                QuotaResultDTO existingResult = findExistingOccupyResult(req);
                return existingResult != null
                        ? RpcResult.success(existingResult, req.getRequestId())
                        : cached;
            }
            return cached;
        }

        String tableSuffix = shardingRouter.routeOrderOccurTable(req.getRegionCode(), req.getOrderId());
        long now = System.currentTimeMillis();

        // Check for existing record by UK (orderId, userId, activityId, regionCode)
        OrderOccupy existing = orderOccupyMapper.selectByUkOrder(
                tableSuffix, req.getRegionCode(), req.getOrderId(), req.getUserId(), req.getActivityId());

        if (existing != null) {
            if (STATUS_OCCUPIED.equals(existing.getStatus()) || STATUS_CONFIRMED.equals(existing.getStatus())) {
                // Idempotent: already occupied or confirmed
                QuotaResultDTO result = buildResult(existing);
                return RpcResult.success(result, req.getRequestId());
            }
            if (STATUS_RELEASED.equals(existing.getStatus())) {
                // Transition RELEASED -> OCCUPIED (re-occupy)
                String beforeJson = toJson(existing);
                int rows = orderOccupyMapper.updateStatus(
                        tableSuffix, existing.getId(), req.getRegionCode(),
                        STATUS_RELEASED, STATUS_OCCUPIED,
                        req.getQuantity(), now);
                if (rows == 0) {
                    // Concurrent update - reselect and return
                    OrderOccupy current = orderOccupyMapper.selectByUkOrder(
                            tableSuffix, req.getRegionCode(), req.getOrderId(),
                            req.getUserId(), req.getActivityId());
                    if (current != null) {
                        return RpcResult.success(buildResult(current), req.getRequestId());
                    }
                }
                existing.setStatus(STATUS_OCCUPIED);
                existing.setQuantity(req.getQuantity());
                existing.setReleasedAt(null);
                existing.setUpdatedAt(now);

                auditService.logStateChange(
                        req.getRequestId(), req.getOperator(), "OCCUPY_QUOTA",
                        AGGREGATE_TYPE, existing.getId(), req.getRegionCode(),
                        beforeJson, toJson(existing));

                idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(existing));
                return RpcResult.success(buildResult(existing), req.getRequestId());
            }
        }

        // Create new occupy record
        OrderOccupy occupy = new OrderOccupy();
        occupy.setId(idGenerator.generateId("occupy"));
        occupy.setOrderId(req.getOrderId());
        occupy.setUserId(req.getUserId());
        occupy.setActivityId(req.getActivityId());
        occupy.setRegionCode(req.getRegionCode());
        occupy.setQuantity(req.getQuantity());
        occupy.setStatus(STATUS_OCCUPIED);
        occupy.setCreatedAt(now);
        occupy.setUpdatedAt(now);

        orderOccupyMapper.insert(tableSuffix, occupy);

        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "OCCUPY_QUOTA",
                AGGREGATE_TYPE, occupy.getId(), req.getRegionCode(),
                "{}", toJson(occupy));

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(occupy));

        return RpcResult.success(buildResult(occupy), req.getRequestId());
    }

    // =========================================================================
    // 2. releaseQuota
    // =========================================================================

    /**
     * Release (un-freeze) previously occupied quota (e.g. order cancelled or timed out).
     * Idempotent: if already released or record not found, returns SUCCESS.
     * Cannot release CONFIRMED quota (would indicate a business conflict).
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<QuotaResultDTO> releaseQuota(ReleaseQuotaRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());
        if (req.getOrderId() == null || req.getOrderId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "orderId is required", req.getRequestId());
        }

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<QuotaResultDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        String tableSuffix = shardingRouter.routeOrderOccurTable(req.getRegionCode(), req.getOrderId());
        long now = System.currentTimeMillis();

        OrderOccupy existing = orderOccupyMapper.selectByUkOrder(
                tableSuffix, req.getRegionCode(), req.getOrderId(), req.getUserId(), req.getActivityId());

        if (existing == null) {
            // Record never existed - treat as idempotent success (already released)
            QuotaResultDTO result = new QuotaResultDTO();
            result.setOrderId(req.getOrderId());
            result.setStatus(STATUS_RELEASED);
            return RpcResult.success(result, req.getRequestId());
        }

        if (STATUS_RELEASED.equals(existing.getStatus())) {
            // Already released - idempotent return
            return RpcResult.success(buildResult(existing), req.getRequestId());
        }

        if (STATUS_CONFIRMED.equals(existing.getStatus())) {
            // Cannot release a confirmed/payment-completed order
            return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                    "Cannot release quota for a CONFIRMED order", req.getRequestId());
        }

        // Must be OCCUPIED -> transition to RELEASED
        String beforeJson = toJson(existing);

        int rows = orderOccupyMapper.updateStatus(
                tableSuffix, existing.getId(), req.getRegionCode(),
                STATUS_OCCUPIED, STATUS_RELEASED,
                existing.getQuantity(), now);
        if (rows == 0) {
            // CAS failed - check if it was concurrently released (idempotent success)
            OrderOccupy current = orderOccupyMapper.selectByUkOrder(
                    tableSuffix, req.getRegionCode(), req.getOrderId(),
                    req.getUserId(), req.getActivityId());
            if (current != null && STATUS_RELEASED.equals(current.getStatus())) {
                return RpcResult.success(buildResult(current), req.getRequestId());
            }
            if (current != null && STATUS_CONFIRMED.equals(current.getStatus())) {
                return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                        "Quota was already CONFIRMED, cannot release", req.getRequestId());
            }
        }

        existing.setStatus(STATUS_RELEASED);
        existing.setReleasedAt(now);
        existing.setUpdatedAt(now);

        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "RELEASE_QUOTA",
                AGGREGATE_TYPE, existing.getId(), req.getRegionCode(),
                beforeJson, toJson(existing));

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(existing));

        return RpcResult.success(buildResult(existing), req.getRequestId());
    }

    // =========================================================================
    // 3. confirmQuota
    // =========================================================================

    /**
     * Confirm quota usage after payment completion. Transitions OCCUPIED -> CONFIRMED.
     * Idempotent on repeated calls with same orderId. Returns ILLEGAL_STATE if no
     * occupy record exists (occupy must come first) and BUSINESS_CONFLICT if the
     * quota was already RELEASED.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<QuotaResultDTO> confirmQuota(ConfirmQuotaRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());
        if (req.getOrderId() == null || req.getOrderId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "orderId is required", req.getRequestId());
        }

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<QuotaResultDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        String tableSuffix = shardingRouter.routeOrderOccurTable(req.getRegionCode(), req.getOrderId());
        long now = System.currentTimeMillis();

        OrderOccupy existing = orderOccupyMapper.selectByUkOrder(
                tableSuffix, req.getRegionCode(), req.getOrderId(), req.getUserId(), req.getActivityId());

        if (existing == null) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "No occupy record found; quota must be occupied before confirming", req.getRequestId());
        }

        if (STATUS_CONFIRMED.equals(existing.getStatus())) {
            // Already confirmed - idempotent return
            return RpcResult.success(buildResult(existing), req.getRequestId());
        }

        if (STATUS_RELEASED.equals(existing.getStatus())) {
            // Was released, cannot confirm anymore
            return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                    "Quota was RELEASED and cannot be confirmed", req.getRequestId());
        }

        // Must be OCCUPIED -> transition to CONFIRMED
        String beforeJson = toJson(existing);

        int rows = orderOccupyMapper.updateStatus(
                tableSuffix, existing.getId(), req.getRegionCode(),
                STATUS_OCCUPIED, STATUS_CONFIRMED,
                existing.getQuantity(), now);
        if (rows == 0) {
            OrderOccupy current = orderOccupyMapper.selectByUkOrder(
                    tableSuffix, req.getRegionCode(), req.getOrderId(),
                    req.getUserId(), req.getActivityId());
            if (current != null && STATUS_CONFIRMED.equals(current.getStatus())) {
                return RpcResult.success(buildResult(current), req.getRequestId());
            }
            return RpcResult.fail(ErrorCode.BUSINESS_CONFLICT,
                    "Concurrent quota state change detected", req.getRequestId());
        }

        existing.setStatus(STATUS_CONFIRMED);
        existing.setConfirmedAt(now);
        existing.setUpdatedAt(now);

        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "CONFIRM_QUOTA",
                AGGREGATE_TYPE, existing.getId(), req.getRegionCode(),
                beforeJson, toJson(existing));

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(existing));

        return RpcResult.success(buildResult(existing), req.getRequestId());
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private QuotaResultDTO buildResult(OrderOccupy o) {
        QuotaResultDTO dto = new QuotaResultDTO();
        dto.setId(o.getId());
        dto.setOrderId(o.getOrderId());
        dto.setUserId(o.getUserId());
        dto.setActivityId(o.getActivityId());
        dto.setRegionCode(o.getRegionCode());
        dto.setQuantity(o.getQuantity());
        dto.setStatus(o.getStatus());
        dto.setOccupyAt(o.getCreatedAt());
        dto.setReleasedAt(o.getReleasedAt());
        dto.setConfirmedAt(o.getConfirmedAt());
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

    private QuotaResultDTO findExistingOccupyResult(OccupyQuotaRequest req) {
        if (req.getOrderId() == null || req.getOrderId().isEmpty()
                || req.getActivityId() == null || req.getActivityId().isEmpty()) {
            return null;
        }
        String tableSuffix = shardingRouter.routeOrderOccurTable(req.getRegionCode(), req.getOrderId());
        OrderOccupy existing = orderOccupyMapper.selectByUkOrder(
                tableSuffix, req.getRegionCode(), req.getOrderId(), req.getUserId(), req.getActivityId());
        return existing == null ? null : buildResult(existing);
    }
}
