package com.ump.marketing.application.service;

import com.ump.marketing.api.dto.PreviewActivityDTO;
import com.ump.marketing.api.dto.PreviewHintDTO;
import com.ump.marketing.api.dto.PreviewQueryRequest;
import com.ump.marketing.api.dto.PreviewResponseDTO;
import com.ump.marketing.api.dto.PreviewResponseDTO.PreviewQuerySummaryDTO;
import com.ump.marketing.api.dto.PreviewSideResultDTO;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.service.RuleValidator;
import com.ump.marketing.infrastructure.client.MarketingRuntimePreviewClient;
import com.ump.marketing.infrastructure.client.PreviewRuntimeClientException;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewRequest;
import com.ump.marketing.infrastructure.client.dto.RuntimePreviewResponse;
import com.ump.marketing.infrastructure.mapper.PreviewQueryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Aggregates preview results from management configuration and runtime services.
 */
@Service
public class PreviewService {
    private static final Logger log = LoggerFactory.getLogger(PreviewService.class);

    private final PreviewQueryMapper previewQueryMapper;
    private final MarketingRuntimePreviewClient marketingRuntimePreviewClient;

    public PreviewService(PreviewQueryMapper previewQueryMapper,
                          MarketingRuntimePreviewClient marketingRuntimePreviewClient) {
        this.previewQueryMapper = previewQueryMapper;
        this.marketingRuntimePreviewClient = marketingRuntimePreviewClient;
    }

    /**
     * Previews activity hits for the provided product or SKU.
     */
    public RpcResult<PreviewResponseDTO> previewActivityHit(PreviewQueryRequest request) {
        normalizeRequest(request);
        validateRequiredText(request.getOperator(), "operator is required");
        validateRequiredText(request.getIdempotencyKey(), "idempotencyKey is required");
        validateRequiredText(request.getProductId(), "productId is required");
        RuleValidator.validateRegionCode(request.getRegionCode());

        boolean queryBySku = hasText(request.getSkuId());
        List<PreviewActivityDTO> managementActivities = queryManagementActivities(request, queryBySku);
        PreviewSideResultDTO managementResult = buildManagementResult(request, queryBySku, managementActivities);

        PreviewSideResultDTO runtimeResult;
        List<PreviewHintDTO> diffHints = new ArrayList<>();
        try {
            RuntimePreviewResponse runtimePreviewResponse = marketingRuntimePreviewClient.preview(toRuntimeRequest(request));
            runtimeResult = buildRuntimeResult(request, queryBySku, runtimePreviewResponse);
            diffHints.addAll(buildDiffHints(managementResult, runtimeResult));
        } catch (PreviewRuntimeClientException ex) {
            log.warn("Runtime preview degraded for requestId={}", request.getRequestId(), ex);
            runtimeResult = buildRuntimeUnavailableResult(request, queryBySku);
            diffHints.add(createHint(
                "RUNTIME_UNAVAILABLE",
                "运行侧结果暂不可用",
                "运行侧接口调用失败或超时，当前仅返回管理配置侧结果，可稍后重试或检查下游服务状态。"
            ));
        }

        PreviewResponseDTO response = new PreviewResponseDTO();
        response.setManagementResult(managementResult);
        response.setRuntimeResult(runtimeResult);
        response.setDiffHints(diffHints);
        response.setQuerySummary(buildQuerySummary(request, queryBySku));
        return RpcResult.success(response, request.getRequestId());
    }

    private List<PreviewActivityDTO> queryManagementActivities(PreviewQueryRequest request, boolean queryBySku) {
        List<PreviewActivityDTO> activities = previewQueryMapper.selectActivities(
            request.getRegionCode(),
            request.getProductId(),
            request.getSkuId(),
            request.getScopeType(),
            queryBySku
        );
        if (activities == null) {
            return Collections.emptyList();
        }
        List<PreviewActivityDTO> normalizedActivities = preferSkuSpecificActivities(activities, queryBySku, request.getSkuId());
        for (PreviewActivityDTO activity : normalizedActivities) {
            activity.setSourceSide("MANAGEMENT");
        }
        return normalizedActivities;
    }

    private PreviewSideResultDTO buildManagementResult(PreviewQueryRequest request,
                                                       boolean queryBySku,
                                                       List<PreviewActivityDTO> activities) {
        PreviewSideResultDTO result = new PreviewSideResultDTO();
        result.setSide("MANAGEMENT");
        result.setHit(!activities.isEmpty());
        result.setAvailable(Boolean.TRUE);
        result.setQueryMode(queryBySku ? "SKU" : "PRODUCT");
        result.setActivities(activities);
        result.setSummary(activities.isEmpty() ? "管理配置侧未命中活动" : "管理配置侧命中 " + activities.size() + " 个活动");
        result.setHints(buildManagementHints(request, queryBySku, activities.isEmpty()));
        return result;
    }

    private PreviewSideResultDTO buildRuntimeResult(PreviewQueryRequest request,
                                                    boolean queryBySku,
                                                    RuntimePreviewResponse runtimePreviewResponse) {
        RuntimePreviewResponse response = runtimePreviewResponse == null
            ? new RuntimePreviewResponse()
            : runtimePreviewResponse;
        PreviewSideResultDTO result = new PreviewSideResultDTO();
        result.setSide("RUNTIME");
        result.setAvailable(defaultBoolean(response.getAvailable(), Boolean.TRUE));
        result.setHit(defaultBoolean(response.getHit(), Boolean.FALSE));
        result.setQueryMode(hasText(response.getQueryMode())
            ? response.getQueryMode()
            : (queryBySku ? "SKU" : "PRODUCT"));
        List<PreviewActivityDTO> runtimeActivities = defaultActivities(response.getActivities());
        for (PreviewActivityDTO activity : runtimeActivities) {
            if (!hasText(activity.getSourceSide())) {
                activity.setSourceSide("RUNTIME");
            }
        }
        result.setActivities(runtimeActivities);
        result.setSummary(hasText(response.getSummary())
            ? response.getSummary()
            : (result.getHit() ? "用户运行侧命中活动" : "用户运行侧未命中活动"));
        result.setReasonCode(response.getReasonCode());
        result.setReasonMessage(response.getReasonMessage());
        result.setHints(buildRuntimeHints(request, result, response));
        return result;
    }

    private PreviewSideResultDTO buildRuntimeUnavailableResult(PreviewQueryRequest request, boolean queryBySku) {
        PreviewSideResultDTO result = new PreviewSideResultDTO();
        result.setSide("RUNTIME");
        result.setAvailable(Boolean.FALSE);
        result.setHit(Boolean.FALSE);
        result.setQueryMode(queryBySku ? "SKU" : "PRODUCT");
        result.setActivities(Collections.<PreviewActivityDTO>emptyList());
        result.setSummary("运行侧结果暂不可用");
        result.setReasonCode("RUNTIME_UNAVAILABLE");
        result.setReasonMessage("运行侧接口调用失败或超时");
        result.setHints(Collections.singletonList(createHint(
            "RUNTIME_UNAVAILABLE",
            "运行侧结果暂不可用",
            "运行侧接口调用失败或超时，建议稍后重试。"
        )));
        return result;
    }

    private List<PreviewHintDTO> buildManagementHints(PreviewQueryRequest request,
                                                      boolean queryBySku,
                                                      boolean empty) {
        if (!empty) {
            return Collections.singletonList(createHint(
                queryBySku ? "SKU_PRIORITY" : "PRODUCT_QUERY",
                queryBySku ? "按 SKU 维度预览" : "按商品维度预览",
                queryBySku
                    ? "本次查询已按 SKU 优先匹配管理配置侧活动。"
                    : "本次查询未提供 SKU，已按商品维度匹配管理配置侧活动。"
            ));
        }
        List<PreviewHintDTO> hints = new ArrayList<>();
        hints.add(createHint("PRODUCT_NOT_BOUND", "商品或 SKU 可能未绑定活动", "请检查活动范围配置是否已绑定当前商品或 SKU。"));
        hints.add(createHint("REGION_MISMATCH", "区域配置可能不一致", "请确认活动区域与查询区域是否一致。"));
        hints.add(createHint("CONFIG_NOT_EFFECTIVE", "活动配置可能尚未生效", "请检查活动状态、提审审批及上线状态。"));
        return hints;
    }

    private List<PreviewHintDTO> buildRuntimeHints(PreviewQueryRequest request,
                                                   PreviewSideResultDTO result,
                                                   RuntimePreviewResponse runtimePreviewResponse) {
        List<PreviewHintDTO> hints = new ArrayList<>();
        hints.add(createHint(
            hasText(request.getSkuId()) ? "SKU_PRIORITY" : "PRODUCT_QUERY",
            hasText(request.getSkuId()) ? "按 SKU 维度预览" : "按商品维度预览",
            hasText(request.getSkuId())
                ? "本次运行侧查询按 SKU 维度发起。"
                : "本次运行侧查询按商品维度发起。"
        ));
        if (!defaultBoolean(result.getAvailable(), Boolean.TRUE)) {
            hints.add(createHint("RUNTIME_UNAVAILABLE", "运行侧结果暂不可用", "运行侧服务暂不可达，当前结果仅供参考。"));
            return hints;
        }
        if (!defaultBoolean(result.getHit(), Boolean.FALSE)) {
            String detail = hasText(runtimePreviewResponse.getReasonMessage())
                ? runtimePreviewResponse.getReasonMessage()
                : "运行侧未命中可能因为活动未上线、同步延迟或用户侧尚未生效。";
            hints.add(createHint("RUNTIME_NOT_HIT", "用户运行侧未命中", detail));
        }
        return hints;
    }

    private List<PreviewHintDTO> buildDiffHints(PreviewSideResultDTO managementResult,
                                                PreviewSideResultDTO runtimeResult) {
        List<PreviewHintDTO> hints = new ArrayList<>();
        boolean managementHit = defaultBoolean(managementResult.getHit(), Boolean.FALSE);
        boolean runtimeAvailable = defaultBoolean(runtimeResult.getAvailable(), Boolean.TRUE);
        boolean runtimeHit = defaultBoolean(runtimeResult.getHit(), Boolean.FALSE);

        if (!runtimeAvailable) {
            hints.add(createHint(
                "RUNTIME_UNAVAILABLE",
                "运行侧结果暂不可用",
                "运行侧服务未返回可用结果，当前请先以管理配置侧结果为准，并稍后重试。"
            ));
        }
        if (managementHit && runtimeAvailable && !runtimeHit) {
            hints.add(createHint(
                "CONFIG_RUNTIME_DIFF",
                "管理侧命中但运行侧未命中",
                "可能存在活动未上线、同步延迟或用户运行侧尚未生效的情况。"
            ));
        }
        if (!managementHit && runtimeAvailable && !runtimeHit) {
            hints.add(createHint(
                "BOTH_NOT_HIT",
                "双侧均未命中",
                "未命中属于正常业务结果，可优先排查商品绑定、区域配置和活动生效状态。"
            ));
        }
        if (managementHit && runtimeHit && hasFieldDiff(managementResult.getActivities(), runtimeResult.getActivities())) {
            hints.add(createHint(
                "ACTIVITY_FIELD_DIFF",
                "双侧活动字段存在差异",
                "请检查活动状态、玩法或优惠核心字段是否仍在同步中。"
            ));
        }
        return hints;
    }

    private boolean hasFieldDiff(List<PreviewActivityDTO> managementActivities,
                                 List<PreviewActivityDTO> runtimeActivities) {
        if (managementActivities == null || runtimeActivities == null) {
            return false;
        }
        int size = Math.min(managementActivities.size(), runtimeActivities.size());
        for (int i = 0; i < size; i++) {
            PreviewActivityDTO management = managementActivities.get(i);
            PreviewActivityDTO runtime = runtimeActivities.get(i);
            if (!Objects.equals(management.getActivityId(), runtime.getActivityId())) {
                continue;
            }
            if (!Objects.equals(management.getStatus(), runtime.getStatus())
                || !Objects.equals(management.getToolType(), runtime.getToolType())
                || !Objects.equals(management.getCouponTemplateId(), runtime.getCouponTemplateId())) {
                return true;
            }
        }
        return false;
    }

    private PreviewQuerySummaryDTO buildQuerySummary(PreviewQueryRequest request, boolean queryBySku) {
        PreviewQuerySummaryDTO summary = new PreviewQuerySummaryDTO();
        summary.setRequestId(request.getRequestId());
        summary.setOperator(request.getOperator());
        summary.setRegionCode(request.getRegionCode());
        summary.setProductId(request.getProductId());
        summary.setSkuId(request.getSkuId());
        summary.setScopeType(request.getScopeType());
        summary.setQueryMode(queryBySku ? "SKU" : "PRODUCT");
        return summary;
    }

    private RuntimePreviewRequest toRuntimeRequest(PreviewQueryRequest request) {
        RuntimePreviewRequest runtimeRequest = new RuntimePreviewRequest();
        runtimeRequest.setRequestId(request.getRequestId());
        runtimeRequest.setCaller(request.getCaller());
        runtimeRequest.setOperator(request.getOperator());
        runtimeRequest.setRegionCode(request.getRegionCode());
        runtimeRequest.setIdempotencyKey(request.getIdempotencyKey());
        runtimeRequest.setTimestampMs(request.getTimestampMs());
        runtimeRequest.setProductId(request.getProductId());
        runtimeRequest.setSkuId(request.getSkuId());
        runtimeRequest.setScopeType(request.getScopeType());
        return runtimeRequest;
    }

    private List<PreviewActivityDTO> defaultActivities(List<PreviewActivityDTO> activities) {
        if (activities == null) {
            return Collections.emptyList();
        }
        return activities;
    }

    private List<PreviewActivityDTO> preferSkuSpecificActivities(List<PreviewActivityDTO> activities,
                                                                 boolean queryBySku,
                                                                 String requestedSkuId) {
        if (!queryBySku || activities.isEmpty()) {
            return activities;
        }
        Map<String, PreviewActivityDTO> deduplicated = new LinkedHashMap<>();
        for (PreviewActivityDTO activity : activities) {
            String activityId = activity.getActivityId();
            if (!hasText(activityId)) {
                deduplicated.put("row-" + deduplicated.size(), activity);
                continue;
            }
            PreviewActivityDTO existing = deduplicated.get(activityId);
            if (existing == null || shouldReplaceForSku(existing, activity, requestedSkuId)) {
                deduplicated.put(activityId, activity);
            }
        }
        return new ArrayList<>(deduplicated.values());
    }

    private boolean shouldReplaceForSku(PreviewActivityDTO existing,
                                        PreviewActivityDTO candidate,
                                        String requestedSkuId) {
        boolean existingExactSku = matchesSku(existing, requestedSkuId);
        boolean candidateExactSku = matchesSku(candidate, requestedSkuId);
        return candidateExactSku && !existingExactSku;
    }

    private boolean matchesSku(PreviewActivityDTO activity, String requestedSkuId) {
        return hasText(requestedSkuId) && requestedSkuId.equals(activity.getSkuId());
    }

    private void normalizeRequest(PreviewQueryRequest request) {
        request.setProductId(trimToNull(request.getProductId()));
        request.setSkuId(trimToNull(request.getSkuId()));
        request.setScopeType(trimToNull(request.getScopeType()));
        request.setOperator(trimToNull(request.getOperator()));
        request.setRegionCode(trimToNull(request.getRegionCode()));
        request.setIdempotencyKey(trimToNull(request.getIdempotencyKey()));
        request.setCaller(trimToNull(request.getCaller()));
        request.setRequestId(trimToNull(request.getRequestId()));
    }

    private String trimToNull(String value) {
        if (!hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private Boolean defaultBoolean(Boolean value, Boolean defaultValue) {
        return value == null ? defaultValue : value;
    }

    private void validateRequiredText(String value, String message) {
        if (!hasText(value)) {
            throw new IllegalArgumentException(message);
        }
    }

    private PreviewHintDTO createHint(String code, String title, String detail) {
        PreviewHintDTO hint = new PreviewHintDTO();
        hint.setCode(code);
        hint.setCategory(code);
        hint.setTitle(title);
        hint.setDetail(detail);
        hint.setMessage(detail);
        return hint;
    }

    private boolean hasText(String value) {
        return StringUtils.hasText(value);
    }
}
