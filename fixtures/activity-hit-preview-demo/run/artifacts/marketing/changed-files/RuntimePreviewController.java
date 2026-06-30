package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.RuntimePreviewRequest;
import com.ump.marketing.api.dto.RuntimePreviewResponse;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.RuntimePreviewService;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

/**
 * REST controller for runtime activity preview queries.
 */
@RestController
@RequestMapping("/api/runtime-preview")
public class RuntimePreviewController {

    private final RuntimePreviewService runtimePreviewService;

    public RuntimePreviewController(RuntimePreviewService runtimePreviewService) {
        this.runtimePreviewService = runtimePreviewService;
    }

    /**
     * Queries runtime-visible marketing activities for a single product or SKU.
     *
     * @param request incoming preview request
     * @param httpServletRequest servlet request used to propagate requestId for unified error handling
     * @return unified RPC result with runtime preview details
     */
    @PostMapping("/query")
    public RpcResult<RuntimePreviewResponse> query(@Valid @RequestBody RuntimePreviewRequest request,
                                                   BindingResult bindingResult,
                                                   HttpServletRequest httpServletRequest) {
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }

        httpServletRequest.setAttribute("requestId", request.getRequestId());
        validateBindingResult(bindingResult);
        request.validate();
        return RpcResult.success(runtimePreviewService.queryRuntimePreview(request), request.getRequestId());
    }

    private void validateBindingResult(BindingResult bindingResult) {
        if (bindingResult == null || !bindingResult.hasErrors()) {
            return;
        }
        FieldError fieldError = bindingResult.getFieldError();
        String message = fieldError != null ? fieldError.getDefaultMessage() : "invalid request body";
        throw new IllegalArgumentException(message);
    }
}
