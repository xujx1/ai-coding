package com.ump.marketing.infrastructure.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Runtime preview downstream client properties.
 */
@Data
@ConfigurationProperties(prefix = "preview.runtime")
public class PreviewRuntimeProperties {
    private String baseUrl = "http://localhost:8082";
    private Integer connectTimeoutMs = 1000;
    private Integer readTimeoutMs = 1500;
}
