package com.ump.marketing.infrastructure.client;

/**
 * Signals runtime preview client failures when calling the downstream marketing service.
 */
public class PreviewRuntimeClientException extends RuntimeException {

    public PreviewRuntimeClientException(String message, Throwable cause) {
        super(message, cause);
    }
}
