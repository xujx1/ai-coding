package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Aggregated preview response for management and runtime sides.
 */
@Data
public class PreviewResponseDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private PreviewSideResultDTO managementResult;
    private PreviewSideResultDTO runtimeResult;
    private List<PreviewHintDTO> diffHints = new ArrayList<>();
    private PreviewQuerySummaryDTO querySummary;

    /**
     * Echoes the resolved preview query context.
     */
    @Data
    public static class PreviewQuerySummaryDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        private String regionCode;
        private String operator;
        private String productId;
        private String skuId;
        private String scopeType;
        private String queryMode;
        private String requestId;
    }
}
