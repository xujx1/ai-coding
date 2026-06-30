package com.ump.marketing.application.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.RuntimePreviewHitDTO;
import com.ump.marketing.api.dto.RuntimePreviewRequest;
import com.ump.marketing.api.dto.RuntimePreviewResponse;
import com.ump.marketing.api.enums.ScopeType;
import com.ump.marketing.domain.model.Activity;
import com.ump.marketing.domain.model.ActivityScope;
import com.ump.marketing.domain.model.ScopeActivity;
import com.ump.marketing.domain.model.SyncEventLog;
import com.ump.marketing.domain.service.RuleValidator;
import com.ump.marketing.domain.service.ScopeKeyGenerator;
import com.ump.marketing.infrastructure.cache.LocalCache;
import com.ump.marketing.infrastructure.mapper.ActivityMapper;
import com.ump.marketing.infrastructure.mapper.ActivityScopeMapper;
import com.ump.marketing.infrastructure.mapper.ScopeActivityMapper;
import com.ump.marketing.infrastructure.mapper.SyncEventLogMapper;
import com.ump.marketing.infrastructure.sharding.ShardingRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Application service for runtime marketing activity preview queries.
 */
@Service
public class RuntimePreviewService {

    private static final Logger log = LoggerFactory.getLogger(RuntimePreviewService.class);
    private static final String MISS_REASON_NO_RUNTIME_MATCH = "NO_RUNTIME_MATCH";
    private static final String MISS_REASON_RUNTIME_NOT_ONLINE = "RUNTIME_NOT_ONLINE";
    private static final String MISS_REASON_FORCE_OFFLINE_BLACKLISTED = "FORCE_OFFLINE_BLACKLISTED";
    private static final String MISS_REASON_SYNC_PENDING_OR_DLQ = "SYNC_PENDING_OR_DLQ";
    private static final String BLACKLIST_NAMESPACE = "blacklist";
    private static final String EVENT_TYPE_PRODUCT_BOUND = "PRODUCT_BOUND";

    private final ScopeActivityMapper scopeActivityMapper;
    private final ActivityMapper activityMapper;
    private final ActivityScopeMapper activityScopeMapper;
    private final SyncEventLogMapper syncEventLogMapper;
    private final ShardingRouter shardingRouter;
    private final LocalCache localCache;
    private final ObjectMapper objectMapper;
    private final ProductService productService;

    public RuntimePreviewService(ScopeActivityMapper scopeActivityMapper,
                                 ActivityMapper activityMapper,
                                 ActivityScopeMapper activityScopeMapper,
                                 SyncEventLogMapper syncEventLogMapper,
                                 ShardingRouter shardingRouter,
                                 LocalCache localCache,
                                 ObjectMapper objectMapper,
                                 ProductService productService) {
        this.scopeActivityMapper = scopeActivityMapper;
        this.activityMapper = activityMapper;
        this.activityScopeMapper = activityScopeMapper;
        this.syncEventLogMapper = syncEventLogMapper;
        this.shardingRouter = shardingRouter;
        this.localCache = localCache;
        this.objectMapper = objectMapper;
        this.productService = productService;
    }

    /**
     * Queries runtime-visible marketing activities for a single product or SKU.
     *
     * @param request preview request
     * @return runtime preview payload with hit list and diagnostics
     */
    public RuntimePreviewResponse queryRuntimePreview(RuntimePreviewRequest request) {
        RuleValidator.validateRegionCode(request.getRegionCode());

        ScopeType matchedScopeType = request.resolveMatchedScopeType();
        String matchedDimension = matchedScopeType.name();
        String effectiveSkuId = matchedScopeType == ScopeType.SKU ? trimToNull(request.getSkuId()) : null;
        String scopeKey = ScopeKeyGenerator.generateScopeKey(
                request.getRegionCode(), matchedDimension, request.getProductId(), effectiveSkuId);

        List<ScopeActivity> onlineActivities = productService.queryOnlineScopeActivities(
                request.getRegionCode(), scopeKey);
        List<ScopeActivity> allScopeActivities = loadAllScopeActivities(request.getRegionCode(), scopeKey);
        Map<String, Activity> activityMap = loadActivityMap(onlineActivities, request.getRegionCode());
        Map<String, ActivityScope> activityScopeMap = loadActivityScopeMap(scopeKey, request.getRegionCode());
        List<RuntimePreviewHitDTO> hits = buildHitList(
                request, scopeKey, matchedDimension, onlineActivities, activityMap, activityScopeMap);

        RuntimePreviewResponse response = new RuntimePreviewResponse();
        response.setMatchedDimension(matchedDimension);
        response.setScopeKey(scopeKey);
        response.setActivities(hits);
        response.setHit(!hits.isEmpty());

        List<String> missReasonCodes = new ArrayList<String>();
        List<String> syncHints = new ArrayList<String>();
        if (!response.isHit()) {
            if (hadBlacklistedActivities(request.getRegionCode(), allScopeActivities)) {
                missReasonCodes.add(MISS_REASON_FORCE_OFFLINE_BLACKLISTED);
            } else if (!allScopeActivities.isEmpty()) {
                missReasonCodes.add(MISS_REASON_RUNTIME_NOT_ONLINE);
            } else {
                missReasonCodes.add(MISS_REASON_NO_RUNTIME_MATCH);
            }

            syncHints.addAll(loadSyncHints(scopeKey, request.getRegionCode()));
            if (!syncHints.isEmpty()) {
                addIfAbsent(missReasonCodes, MISS_REASON_SYNC_PENDING_OR_DLQ);
            }
        }

        response.setMissReasonCodes(missReasonCodes);
        response.setSyncHints(syncHints);
        return response;
    }

    private List<ScopeActivity> loadAllScopeActivities(String regionCode, String scopeKey) {
        String tableSuffix = shardingRouter.routeScopeActTable(regionCode, scopeKey);
        List<ScopeActivity> activities = scopeActivityMapper.selectByScopeKey(tableSuffix, scopeKey, regionCode);
        return activities == null ? Collections.<ScopeActivity>emptyList() : activities;
    }

    private Map<String, Activity> loadActivityMap(List<ScopeActivity> onlineActivities, String regionCode) {
        if (onlineActivities.isEmpty()) {
            return Collections.emptyMap();
        }

        List<String> activityIds = new ArrayList<String>();
        for (ScopeActivity scopeActivity : onlineActivities) {
            activityIds.add(scopeActivity.getActivityId());
        }

        List<Activity> activities = activityMapper.selectByActivityIds(activityIds, regionCode);
        if (activities == null || activities.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<String, Activity> activityMap = new LinkedHashMap<String, Activity>();
        for (Activity activity : activities) {
            activityMap.put(activity.getActivityId(), activity);
        }
        return activityMap;
    }

    private Map<String, ActivityScope> loadActivityScopeMap(String scopeKey, String regionCode) {
        List<ActivityScope> activityScopes = activityScopeMapper.selectByScopeKeyForPreview(scopeKey, regionCode);
        if (activityScopes == null || activityScopes.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<String, ActivityScope> activityScopeMap = new LinkedHashMap<String, ActivityScope>();
        for (ActivityScope activityScope : activityScopes) {
            activityScopeMap.put(activityScope.getActivityId(), activityScope);
        }
        return activityScopeMap;
    }

    private boolean hadBlacklistedActivities(String regionCode, List<ScopeActivity> allScopeActivities) {
        if (allScopeActivities.isEmpty()) {
            return false;
        }
        for (ScopeActivity scopeActivity : allScopeActivities) {
            if (!"ONLINE".equalsIgnoreCase(scopeActivity.getStatus())) {
                continue;
            }
            if (localCache.isMember(BLACKLIST_NAMESPACE, buildBlacklistKey(regionCode, scopeActivity.getActivityId()))) {
                return true;
            }
        }
        return false;
    }

    private List<RuntimePreviewHitDTO> buildHitList(RuntimePreviewRequest request,
                                                    String scopeKey,
                                                    String matchedDimension,
                                                    List<ScopeActivity> onlineActivities,
                                                    Map<String, Activity> activityMap,
                                                    Map<String, ActivityScope> activityScopeMap) {
        if (onlineActivities.isEmpty()) {
            return Collections.emptyList();
        }

        List<RuntimePreviewHitDTO> hits = new ArrayList<RuntimePreviewHitDTO>();
        for (ScopeActivity scopeActivity : onlineActivities) {
            hits.add(buildHit(
                    request,
                    scopeKey,
                    matchedDimension,
                    scopeActivity,
                    activityMap.get(scopeActivity.getActivityId()),
                    activityScopeMap.get(scopeActivity.getActivityId())));
        }
        Collections.sort(hits, new Comparator<RuntimePreviewHitDTO>() {
            @Override
            public int compare(RuntimePreviewHitDTO left, RuntimePreviewHitDTO right) {
                return safeString(left.getActivityId()).compareTo(safeString(right.getActivityId()));
            }
        });
        return hits;
    }

    private RuntimePreviewHitDTO buildHit(RuntimePreviewRequest request,
                                          String scopeKey,
                                          String matchedDimension,
                                          ScopeActivity scopeActivity,
                                          Activity activity,
                                          ActivityScope activityScope) {
        RuntimePreviewHitDTO hit = new RuntimePreviewHitDTO();
        hit.setActivityId(scopeActivity.getActivityId());
        hit.setActivityName(activity != null ? activity.getActivityName() : null);
        hit.setStatus(activity != null ? activity.getStatus() : scopeActivity.getStatus());
        hit.setToolType(firstNonBlank(activity != null ? activity.getToolType() : null, scopeActivity.getToolType()));
        hit.setThresholdAmount(firstNonNull(
                activity != null ? activity.getThresholdAmount() : null,
                scopeActivity.getThresholdAmount()));
        hit.setDiscountAmount(firstNonNull(
                activity != null ? activity.getDiscountAmount() : null,
                scopeActivity.getDiscountAmount()));
        hit.setDiscountRate(firstNonNull(
                activity != null ? activity.getDiscountRate() : null,
                scopeActivity.getDiscountRate()));
        hit.setMaxDiscount(firstNonNull(
                activity != null ? activity.getMaxDiscount() : null,
                scopeActivity.getMaxDiscount()));
        hit.setCouponTemplateId(firstNonBlank(
                activity != null ? activity.getCouponTemplateId() : null,
                scopeActivity.getCouponTemplateId()));
        hit.setRegionCode(scopeActivity.getRegionCode());
        hit.setScopeKey(scopeKey);
        hit.setMatchedDimension(matchedDimension);

        if (activityScope != null) {
            hit.setProductId(activityScope.getProductId());
            hit.setSkuId(activityScope.getSkuId());
            hit.setScopeType(activityScope.getScopeType());
        } else {
            hit.setProductId(request.getProductId());
            hit.setSkuId(trimToNull(request.getSkuId()));
            hit.setScopeType(matchedDimension);
        }
        return hit;
    }

    private List<String> loadSyncHints(String scopeKey, String regionCode) {
        List<String> hints = new ArrayList<String>();
        try {
            SyncEventLog syncEventLog = syncEventLogMapper.selectLatestByAggregateIdAndEventType(
                    scopeKey, regionCode, EVENT_TYPE_PRODUCT_BOUND);
            if (syncEventLog == null) {
                return hints;
            }
            String consumeStatus = trimToNull(syncEventLog.getConsumeStatus());
            if (consumeStatus == null) {
                return hints;
            }
            if (SyncEventLog.STATUS_SUCCESS.equalsIgnoreCase(consumeStatus)
                    || "COMPLETED".equalsIgnoreCase(consumeStatus)) {
                return hints;
            }
            hints.add(toSyncHint(syncEventLog));
        } catch (Exception ex) {
            log.debug("Failed to load runtime preview sync hints for scopeKey={} regionCode={}", scopeKey, regionCode, ex);
        }
        return hints;
    }

    private String toSyncHint(SyncEventLog syncEventLog) {
        Map<String, Object> hint = new LinkedHashMap<String, Object>();
        hint.put("eventType", syncEventLog.getEventType());
        hint.put("consumeStatus", syncEventLog.getConsumeStatus());
        hint.put("retryCount", syncEventLog.getRetryCount());
        hint.put("errorMessage", syncEventLog.getErrorMessage());
        try {
            return objectMapper.writeValueAsString(hint);
        } catch (JsonProcessingException ex) {
            return hint.toString();
        }
    }

    private void addIfAbsent(List<String> values, String value) {
        if (!values.contains(value)) {
            values.add(value);
        }
    }

    private String buildBlacklistKey(String regionCode, String activityId) {
        return "force_offline:" + regionCode + ":" + activityId;
    }

    private String firstNonBlank(String preferred, String fallback) {
        String normalizedPreferred = trimToNull(preferred);
        return normalizedPreferred != null ? normalizedPreferred : trimToNull(fallback);
    }

    private BigDecimal firstNonNull(BigDecimal preferred, BigDecimal fallback) {
        return preferred != null ? preferred : fallback;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String safeString(String value) {
        return value == null ? "" : value;
    }
}
