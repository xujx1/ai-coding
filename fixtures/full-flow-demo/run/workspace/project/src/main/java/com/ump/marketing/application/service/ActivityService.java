package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.ApproveActivityRequest;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.dto.DeleteActivityRequest;
import com.ump.marketing.api.dto.ForceOfflineRequest;
import com.ump.marketing.api.dto.OnlineActivityRequest;
import com.ump.marketing.api.dto.PauseActivityRequest;
import com.ump.marketing.api.dto.RejectActivityRequest;
import com.ump.marketing.api.dto.SubmitApprovalRequest;
import com.ump.marketing.api.dto.UpdateActivityRequest;
import com.ump.marketing.api.enums.ActivityStatus;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.Activity;
import com.ump.marketing.domain.service.RuleValidator;
import com.ump.marketing.domain.statemachine.ActivityStateMachine;
import com.ump.marketing.infrastructure.cache.LocalCache;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.mapper.ActivityMapper;
import com.ump.marketing.infrastructure.sharding.RegionRouter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Application service for the Activity bounded context.
 * Handles activity lifecycle: create, update, submit, approve, reject, online, pause, force-offline.
 */
@Service
public class ActivityService {

    private static final String AGGREGATE_TYPE = "Activity";
    private static final int IDEMPOTENCY_TTL_DAYS = 7;
    private static final Set<String> DELETABLE_STATUSES = new HashSet<>(Arrays.asList(
            ActivityStatus.DRAFT.name(),
            ActivityStatus.REJECTED.name(),
            ActivityStatus.TERMINATED.name()
    ));

    private final ActivityMapper activityMapper;
    private final IdempotencyService idempotencyService;
    private final AuditService auditService;
    private final SyncEventPublisher syncEventPublisher;
    private final RegionRouter regionRouter;
    private final IdGenerator idGenerator;
    private final LocalCache localCache;
    private final ObjectMapper objectMapper;

    public ActivityService(ActivityMapper activityMapper,
                           IdempotencyService idempotencyService,
                           AuditService auditService,
                           SyncEventPublisher syncEventPublisher,
                           RegionRouter regionRouter,
                           IdGenerator idGenerator,
                           LocalCache localCache,
                           @Autowired(required = false) ObjectMapper objectMapper) {
        this.activityMapper = activityMapper;
        this.idempotencyService = idempotencyService;
        this.auditService = auditService;
        this.syncEventPublisher = syncEventPublisher;
        this.regionRouter = regionRouter;
        this.idGenerator = idGenerator;
        this.localCache = localCache;
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // 1. createActivity
    // =========================================================================

    /**
     * Create a new activity in DRAFT status.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityDTO> createActivity(CreateActivityRequest req) {
        // Validate
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());
        if (req.getActivityName() == null || req.getActivityName().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "activityName is required", req.getRequestId());
        }

        // Idempotency check
        String requestHash = hashRequest(req);
        RpcResult<ActivityDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        long now = System.currentTimeMillis();

        Activity activity = new Activity();
        activity.setActivityId(idGenerator.generateId("act"));
        activity.setTenantId(req.getTenantId());
        activity.setActivityName(req.getActivityName());
        activity.setRegionCode(req.getRegionCode());
        activity.setToolId(req.getToolId());
        activity.setToolType(req.getToolType());
        activity.setStatus(ActivityStatus.DRAFT.name());
        activity.setVersion(0);
        activity.setThresholdAmount(req.getThresholdAmount());
        activity.setDiscountAmount(req.getDiscountAmount());
        activity.setDiscountRate(req.getDiscountRate());
        activity.setMaxDiscount(req.getMaxDiscount());
        activity.setCouponTemplateId(req.getCouponTemplateId());
        activity.setStartTime(req.getStartTime());
        activity.setEndTime(req.getEndTime());
        activity.setScopeType(req.getScopeType());
        activity.setScopeRefs(req.getScopeRefs());
        activity.setIsPurchaseLimited(req.getIsPurchaseLimited() != null ? req.getIsPurchaseLimited() : false);
        activity.setPurchaseLimitPerUser(req.getPurchaseLimitPerUser());
        activity.setCreatedAt(now);
        activity.setUpdatedAt(now);
        activity.setCreatedBy(req.getOperator());
        activity.setUpdatedBy(req.getOperator());

        activityMapper.insert(activity);

        // Audit log
        String afterJson = toJson(activity);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "CREATE_ACTIVITY",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                "{}", afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(convertToDTO(activity), req.getRequestId())));

        return RpcResult.success(convertToDTO(activity), req.getRequestId());
    }

    // =========================================================================
    // 2. updateActivity
    // =========================================================================

    /**
     * Update an existing activity. Only DRAFT or REJECTED activities can be edited.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityDTO> updateActivity(UpdateActivityRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        RpcResult<ActivityDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        String currentStatus = activity.getStatus();
        if (!ActivityStatus.DRAFT.name().equals(currentStatus)
                && !ActivityStatus.REJECTED.name().equals(currentStatus)) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only DRAFT or REJECTED activities can be updated, current status: " + currentStatus,
                    req.getRequestId());
        }

        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();

        // Optimistic locking: if expectedVersion provided, verify it matches
        if (req.getExpectedVersion() != null && !req.getExpectedVersion().equals(activity.getVersion())) {
            return RpcResult.fail(ErrorCode.VERSION_CONFLICT, "Version mismatch", req.getRequestId());
        }

        // Update mutable fields
        if (req.getActivityName() != null) {
            activity.setActivityName(req.getActivityName());
        }
        if (req.getThresholdAmount() != null) {
            activity.setThresholdAmount(req.getThresholdAmount());
        }
        if (req.getDiscountAmount() != null) {
            activity.setDiscountAmount(req.getDiscountAmount());
        }
        if (req.getDiscountRate() != null) {
            activity.setDiscountRate(req.getDiscountRate());
        }
        if (req.getMaxDiscount() != null) {
            activity.setMaxDiscount(req.getMaxDiscount());
        }
        if (req.getStartTime() != null) {
            activity.setStartTime(req.getStartTime());
        }
        if (req.getEndTime() != null) {
            activity.setEndTime(req.getEndTime());
        }
        if (req.getScopeType() != null) {
            activity.setScopeType(req.getScopeType());
        }
        if (req.getScopeRefs() != null) {
            activity.setScopeRefs(req.getScopeRefs());
        }
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());

        int rows = activityMapper.updateWithVersion(activity);
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.VERSION_CONFLICT, "Concurrent update detected", req.getRequestId());
        }

        activity.setVersion(activity.getVersion() + 1);

        String afterJson = toJson(activity);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "UPDATE_ACTIVITY",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        syncEventPublisher.publishEvent(
                "ACTIVITY_UPDATED", AGGREGATE_TYPE, activity.getActivityId(),
                req.getRegionCode(), activity.getVersion().longValue(), afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(convertToDTO(activity), req.getRequestId())));

        return RpcResult.success(convertToDTO(activity), req.getRequestId());
    }

    // =========================================================================
    // 3. submitForApproval
    // =========================================================================

    /**
     * Submit a DRAFT activity for approval.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityDTO> submitForApproval(SubmitApprovalRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        RpcResult<ActivityDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        if (!ActivityStatus.DRAFT.name().equals(activity.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only DRAFT activities can be submitted for approval, current: " + activity.getStatus(),
                    req.getRequestId());
        }

        ActivityStateMachine.assertTransition(ActivityStatus.DRAFT, ActivityStatus.PENDING_APPROVAL);

        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();
        int oldVersion = activity.getVersion();
        int newVersion = oldVersion + 1;

        int rows = activityMapper.updateStatus(
                req.getActivityId(), req.getRegionCode(),
                ActivityStatus.DRAFT.name(), ActivityStatus.PENDING_APPROVAL.name(),
                oldVersion, newVersion, now, req.getOperator());
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Concurrent state modification detected", req.getRequestId());
        }

        activity.setStatus(ActivityStatus.PENDING_APPROVAL.name());
        activity.setVersion(newVersion);
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());

        String afterJson = toJson(activity);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "SUBMIT_APPROVAL",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(convertToDTO(activity), req.getRequestId())));

        return RpcResult.success(convertToDTO(activity), req.getRequestId());
    }

    // =========================================================================
    // 4. approveActivity
    // =========================================================================

    /**
     * Approve a PENDING_APPROVAL activity.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityDTO> approveActivity(ApproveActivityRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        RpcResult<ActivityDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        if (!ActivityStatus.PENDING_APPROVAL.name().equals(activity.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only PENDING_APPROVAL activities can be approved, current: " + activity.getStatus(),
                    req.getRequestId());
        }

        ActivityStateMachine.assertTransition(ActivityStatus.PENDING_APPROVAL, ActivityStatus.APPROVED);

        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();
        int oldVersion = activity.getVersion();
        int newVersion = oldVersion + 1;

        int rows = activityMapper.updateStatusWithApproval(
                req.getActivityId(), req.getRegionCode(),
                ActivityStatus.PENDING_APPROVAL.name(), ActivityStatus.APPROVED.name(),
                req.getApproverId(), now,
                oldVersion, newVersion, now, req.getOperator(), null);
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Concurrent state modification detected", req.getRequestId());
        }

        activity.setStatus(ActivityStatus.APPROVED.name());
        activity.setApproverId(req.getApproverId());
        activity.setApprovalTime(now);
        activity.setRejectReason(null);
        activity.setVersion(newVersion);
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());

        String afterJson = toJson(activity);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "APPROVE_ACTIVITY",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        syncEventPublisher.publishEvent(
                "ACTIVITY_APPROVED", AGGREGATE_TYPE, activity.getActivityId(),
                req.getRegionCode(), activity.getVersion().longValue(), afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(convertToDTO(activity), req.getRequestId())));

        return RpcResult.success(convertToDTO(activity), req.getRequestId());
    }

    // =========================================================================
    // 5. rejectActivity
    // =========================================================================

    /**
     * Reject a PENDING_APPROVAL activity.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityDTO> rejectActivity(RejectActivityRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        RpcResult<ActivityDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        if (!ActivityStatus.PENDING_APPROVAL.name().equals(activity.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only PENDING_APPROVAL activities can be rejected, current: " + activity.getStatus(),
                    req.getRequestId());
        }

        ActivityStateMachine.assertTransition(ActivityStatus.PENDING_APPROVAL, ActivityStatus.REJECTED);

        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();
        int oldVersion = activity.getVersion();
        int newVersion = oldVersion + 1;

        int rows = activityMapper.updateStatusWithApproval(
                req.getActivityId(), req.getRegionCode(),
                ActivityStatus.PENDING_APPROVAL.name(), ActivityStatus.REJECTED.name(),
                req.getApproverId(), now,
                oldVersion, newVersion, now, req.getOperator(), req.getReason());
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Concurrent state modification detected", req.getRequestId());
        }

        activity.setStatus(ActivityStatus.REJECTED.name());
        activity.setApproverId(req.getApproverId());
        activity.setApprovalTime(now);
        activity.setRejectReason(req.getReason());
        activity.setVersion(newVersion);
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());

        String afterJson = toJson(activity);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "REJECT_ACTIVITY",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(convertToDTO(activity), req.getRequestId())));

        return RpcResult.success(convertToDTO(activity), req.getRequestId());
    }

    // =========================================================================
    // 6. onlineActivity
    // =========================================================================

    /**
     * Bring an APPROVED activity online so it is visible on the C-end.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityDTO> onlineActivity(OnlineActivityRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        RpcResult<ActivityDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        if (!ActivityStatus.APPROVED.name().equals(activity.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only APPROVED activities can be brought online, current: " + activity.getStatus(),
                    req.getRequestId());
        }

        ActivityStateMachine.assertTransition(ActivityStatus.APPROVED, ActivityStatus.ONLINE);

        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();
        int oldVersion = activity.getVersion();
        int newVersion = oldVersion + 1;

        int rows = activityMapper.updateStatusOnline(
                req.getActivityId(), req.getRegionCode(),
                ActivityStatus.APPROVED.name(), ActivityStatus.ONLINE.name(),
                now,
                oldVersion, newVersion, now, req.getOperator());
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Concurrent state modification detected", req.getRequestId());
        }

        activity.setStatus(ActivityStatus.ONLINE.name());
        activity.setVersion(newVersion);
        activity.setOnlineTime(now);
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());

        String afterJson = toJson(activity);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "ONLINE_ACTIVITY",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        // Publish immediately so C-end consumers can pick it up
        syncEventPublisher.publishEvent(
                "ACTIVITY_ONLINE", AGGREGATE_TYPE, activity.getActivityId(),
                req.getRegionCode(), activity.getVersion().longValue(), afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(convertToDTO(activity), req.getRequestId())));

        return RpcResult.success(convertToDTO(activity), req.getRequestId());
    }

    // =========================================================================
    // 7. pauseActivity
    // =========================================================================

    /**
     * Pause an ONLINE activity or resume a PAUSED activity (toggle).
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<ActivityDTO> pauseActivity(PauseActivityRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        RpcResult<ActivityDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        String currentStatus = activity.getStatus();
        String targetStatus;
        String eventType;
        String operationType;

        if (ActivityStatus.ONLINE.name().equals(currentStatus)) {
            targetStatus = ActivityStatus.PAUSED.name();
            eventType = "ACTIVITY_PAUSED";
            operationType = "PAUSE_ACTIVITY";
        } else if (ActivityStatus.PAUSED.name().equals(currentStatus)) {
            targetStatus = ActivityStatus.ONLINE.name();
            eventType = "ACTIVITY_RESUMED";
            operationType = "RESUME_ACTIVITY";
        } else {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only ONLINE or PAUSED activities can be paused/resumed, current: " + currentStatus,
                    req.getRequestId());
        }

        ActivityStateMachine.assertTransition(
                ActivityStatus.valueOf(currentStatus), ActivityStatus.valueOf(targetStatus));

        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();
        int oldVersion = activity.getVersion();
        int newVersion = oldVersion + 1;

        int rows = activityMapper.updateStatus(
                req.getActivityId(), req.getRegionCode(),
                currentStatus, targetStatus,
                oldVersion, newVersion, now, req.getOperator());
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Concurrent state modification detected", req.getRequestId());
        }

        activity.setStatus(targetStatus);
        activity.setVersion(newVersion);
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());

        String afterJson = toJson(activity);
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), operationType,
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        syncEventPublisher.publishEvent(
                eventType, AGGREGATE_TYPE, activity.getActivityId(),
                req.getRegionCode(), activity.getVersion().longValue(), afterJson);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(convertToDTO(activity), req.getRequestId())));

        return RpcResult.success(convertToDTO(activity), req.getRequestId());
    }

    // =========================================================================
    // 8. forceOfflineActivity
    // =========================================================================

    /**
     * Forcefully terminate an activity (emergency offline). This is a critical operation
     * that bypasses normal state machine transitions and immediately blacklists the activity.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<Void> forceOfflineActivity(ForceOfflineRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        @SuppressWarnings("unchecked")
        RpcResult<Void> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        if (ActivityStatus.TERMINATED.name().equals(activity.getStatus())) {
            RpcResult<Void> result = RpcResult.success(null, req.getRequestId());
            idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(result));
            return result;
        }

        // Force transition: any non-terminal state -> TERMINATED
        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();
        int oldVersion = activity.getVersion();
        int newVersion = oldVersion + 1;

        int rows = activityMapper.updateStatusForceOffline(
                req.getActivityId(), req.getRegionCode(),
                activity.getStatus(), ActivityStatus.TERMINATED.name(),
                req.getReason(),
                oldVersion, newVersion, now, req.getOperator());
        if (rows == 0) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE, "Concurrent state modification detected", req.getRequestId());
        }

        activity.setStatus(ActivityStatus.TERMINATED.name());
        activity.setForceOfflineReason(req.getReason());
        activity.setVersion(newVersion);
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());

        String afterJson = toJson(activity);

        // Critical operation - log with reason
        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "FORCE_OFFLINE_ACTIVITY",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        // Publish high-priority force offline event
        syncEventPublisher.publishEvent(
                "ACTIVITY_FORCE_OFFLINE", AGGREGATE_TYPE, activity.getActivityId(),
                req.getRegionCode(), activity.getVersion().longValue(), afterJson);

        // Add to blacklist cache for 24 hours so C-end rejects immediately
        String blacklistKey = "force_offline:" + req.getRegionCode() + ":" + req.getActivityId();
        localCache.put("blacklist", blacklistKey, Boolean.TRUE, 24, TimeUnit.HOURS);

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(),
                toJson(RpcResult.success(null, req.getRequestId())));

        return RpcResult.success(null, req.getRequestId());
    }

    // =========================================================================
    // 9. deleteActivity
    // =========================================================================

    /**
     * Soft delete an activity when the current status allows removal.
     */
    @Transactional(rollbackFor = Exception.class)
    public RpcResult<Void> deleteActivity(DeleteActivityRequest req) {
        RpcResult<Void> validationResult = validateDeleteRequest(req);
        if (validationResult != null) {
            return validationResult;
        }

        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        String requestHash = hashRequest(req);
        RpcResult<Void> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS, req.getRequestId());
        if (cached != null) {
            return cached;
        }

        Activity activity = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
        if (activity == null) {
            return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
        }

        if (!DELETABLE_STATUSES.contains(activity.getStatus())) {
            return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                    "Only DRAFT, REJECTED or TERMINATED activities can be deleted, current status: " + activity.getStatus(),
                    req.getRequestId());
        }

        String beforeJson = toJson(activity);
        long now = System.currentTimeMillis();
        int rows = activityMapper.softDelete(
                req.getActivityId(),
                req.getRegionCode(),
                activity.getStatus(),
                activity.getVersion(),
                now,
                req.getOperator());
        if (rows == 0) {
            Activity current = activityMapper.selectByActivityId(req.getActivityId(), req.getRegionCode());
            if (current == null) {
                return RpcResult.fail(ErrorCode.RESOURCE_NOT_FOUND, "Activity not found", req.getRequestId());
            }
            if (!DELETABLE_STATUSES.contains(current.getStatus())) {
                return RpcResult.fail(ErrorCode.ILLEGAL_STATE,
                        "Only DRAFT, REJECTED or TERMINATED activities can be deleted, current status: " + current.getStatus(),
                        req.getRequestId());
            }
            return RpcResult.fail(ErrorCode.VERSION_CONFLICT, "Concurrent delete detected", req.getRequestId());
        }

        activity.setIsDeleted(true);
        activity.setUpdatedAt(now);
        activity.setUpdatedBy(req.getOperator());
        activity.setVersion(activity.getVersion() + 1);
        String afterJson = toJson(activity);

        auditService.logStateChange(
                req.getRequestId(), req.getOperator(), "DELETE_ACTIVITY",
                AGGREGATE_TYPE, activity.getActivityId(), req.getRegionCode(),
                beforeJson, afterJson);

        RpcResult<Void> result = RpcResult.success(null, req.getRequestId());
        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(result));
        return result;
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private ActivityDTO convertToDTO(Activity a) {
        ActivityDTO dto = new ActivityDTO();
        dto.setActivityId(a.getActivityId());
        dto.setTenantId(a.getTenantId());
        dto.setActivityName(a.getActivityName());
        dto.setRegionCode(a.getRegionCode());
        dto.setToolId(a.getToolId());
        dto.setToolType(a.getToolType());
        dto.setStatus(a.getStatus());
        dto.setVersion(a.getVersion());
        dto.setThresholdAmount(a.getThresholdAmount());
        dto.setDiscountAmount(a.getDiscountAmount());
        dto.setDiscountRate(a.getDiscountRate());
        dto.setMaxDiscount(a.getMaxDiscount());
        dto.setCouponTemplateId(a.getCouponTemplateId());
        dto.setStartTime(a.getStartTime());
        dto.setEndTime(a.getEndTime());
        dto.setScopeType(a.getScopeType());
        dto.setScopeRefs(a.getScopeRefs());
        dto.setIsPurchaseLimited(a.getIsPurchaseLimited());
        dto.setPurchaseLimitPerUser(a.getPurchaseLimitPerUser());
        dto.setApproverId(a.getApproverId());
        dto.setApprovalTime(a.getApprovalTime());
        dto.setOnlineTime(a.getOnlineTime());
        dto.setRejectReason(a.getRejectReason());
        dto.setForceOfflineReason(a.getForceOfflineReason());
        dto.setCreatedAt(a.getCreatedAt());
        dto.setUpdatedAt(a.getUpdatedAt());
        dto.setCreatedBy(a.getCreatedBy());
        dto.setUpdatedBy(a.getUpdatedBy());
        return dto;
    }

    private RpcResult<Void> validateDeleteRequest(DeleteActivityRequest req) {
        if (req == null) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "request body is required", null);
        }
        if (req.getRequestId() == null || req.getRequestId().trim().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "requestId is required", null);
        }
        if (req.getActivityId() == null || req.getActivityId().trim().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "activityId is required", req.getRequestId());
        }
        if (req.getRegionCode() == null || req.getRegionCode().trim().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "regionCode is required", req.getRequestId());
        }
        if (req.getIdempotencyKey() == null || req.getIdempotencyKey().trim().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "idempotencyKey is required", req.getRequestId());
        }
        if (req.getOperator() == null || req.getOperator().trim().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "operator is required", req.getRequestId());
        }
        return null;
    }

    private String hashRequest(Object req) {
        return toJson(req);
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
