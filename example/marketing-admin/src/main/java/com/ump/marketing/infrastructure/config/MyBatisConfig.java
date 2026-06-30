package com.ump.marketing.infrastructure.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * MyBatis configuration for Sprint 1.
 * <p>
 * Scans the {@code com.ump.marketing.infrastructure.mapper} package for {@code @Mapper} interfaces
 * and registers them as Spring beans. No additional MyBatis customization is needed in Sprint 1.
 */
@Configuration
@MapperScan("com.ump.marketing.infrastructure.mapper")
public class MyBatisConfig {
    // No special config needed for Sprint 1; mapper scan handles registration.
}
