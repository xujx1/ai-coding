package com.ump.marketing.api.result;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.ump.marketing.api.enums.ErrorCode;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * Unified RPC response wrapper.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RpcResult<T> implements Serializable {
    private static final long serialVersionUID = 1L;

    private int code;
    private String message;
    private String requestId;
    private T data;

    public static <T> RpcResult<T> success(T data, String requestId) {
        return new RpcResult<>(ErrorCode.SUCCESS.getCode(), ErrorCode.SUCCESS.getMessage(), requestId, data);
    }

    public static <T> RpcResult<T> success(T data) {
        return success(data, null);
    }

    public static <T> RpcResult<T> fail(ErrorCode errorCode, String requestId) {
        return new RpcResult<>(errorCode.getCode(), errorCode.getMessage(), requestId, null);
    }

    public static <T> RpcResult<T> fail(ErrorCode errorCode, String message, String requestId) {
        return new RpcResult<>(errorCode.getCode(), message, requestId, null);
    }

    public static <T> RpcResult<T> fail(int code, String message, String requestId) {
        return new RpcResult<>(code, message, requestId, null);
    }

    @JsonProperty("success")
    public boolean isSuccess() {
        return code == ErrorCode.SUCCESS.getCode();
    }
}
