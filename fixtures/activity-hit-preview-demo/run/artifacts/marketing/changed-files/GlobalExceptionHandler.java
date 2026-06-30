package com.ump.marketing.web.controller;

import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Locale;

import javax.servlet.http.HttpServletRequest;

/**
 * Maps request validation errors to the unified RPC response contract.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Handles bean validation failures raised by {@code @Valid}.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public RpcResult<Void> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
                                                        HttpServletRequest request) {
        FieldError fieldError = ex.getBindingResult().getFieldError();
        String message = fieldError != null ? fieldError.getDefaultMessage() : ErrorCode.INVALID_ARGUMENT.getMessage();
        return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, message, extractRequestId(request));
    }

    /**
     * Handles malformed or missing request bodies.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public RpcResult<Void> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
                                                        HttpServletRequest request) {
        String message = "request body is required";
        if (ex.getCause() != null && ex.getCause().getMessage() != null) {
            String causeMessage = ex.getCause().getMessage().toLowerCase(Locale.ROOT);
            if (causeMessage.contains("json parse error") || causeMessage.contains("unexpected character")
                    || causeMessage.contains("unexpected end-of-input") || causeMessage.contains("cannot deserialize")) {
                message = "invalid request body";
            }
        }
        return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, message, extractRequestId(request));
    }

    /**
     * Handles domain validation exceptions converted from utility validators.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public RpcResult<Void> handleIllegalArgumentException(IllegalArgumentException ex,
                                                          HttpServletRequest request) {
        return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, ex.getMessage(), extractRequestId(request));
    }

    private String extractRequestId(HttpServletRequest request) {
        Object value = request.getAttribute("requestId");
        return value == null ? null : String.valueOf(value);
    }
}
