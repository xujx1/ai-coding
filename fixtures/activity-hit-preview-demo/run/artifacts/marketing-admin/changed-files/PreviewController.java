package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.PreviewQueryRequest;
import com.ump.marketing.api.dto.PreviewResponseDTO;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.PreviewService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

/**
 * Provides a single-query preview API for activity hit inspection.
 */
@RestController
@RequestMapping("/api/preview")
@Validated
public class PreviewController {

    private final PreviewService previewService;

    public PreviewController(PreviewService previewService) {
        this.previewService = previewService;
    }

    /**
     * Aggregates management-side and runtime-side preview results.
     */
    @PostMapping("/activity-hit")
    public RpcResult<PreviewResponseDTO> previewActivityHit(@Valid @RequestBody PreviewQueryRequest request,
                                                            HttpServletRequest httpServletRequest) {
        httpServletRequest.setAttribute("requestId", request.getRequestId());
        return previewService.previewActivityHit(request);
    }
}
