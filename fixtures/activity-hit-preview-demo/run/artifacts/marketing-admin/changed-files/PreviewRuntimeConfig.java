package com.ump.marketing.infrastructure.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Configures the downstream runtime preview HTTP client.
 */
@Configuration
@EnableConfigurationProperties(PreviewRuntimeProperties.class)
public class PreviewRuntimeConfig {

    /**
     * Creates a dedicated RestTemplate for runtime preview calls.
     */
    @Bean(name = "previewRuntimeRestTemplate")
    public RestTemplate previewRuntimeRestTemplate(PreviewRuntimeProperties properties) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(properties.getConnectTimeoutMs());
        factory.setReadTimeout(properties.getReadTimeoutMs());
        return new RestTemplate(factory);
    }
}
