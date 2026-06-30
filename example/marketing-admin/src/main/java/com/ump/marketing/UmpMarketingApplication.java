package com.ump.marketing;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@MapperScan("com.ump.marketing.infrastructure.mapper")
public class UmpMarketingApplication {
    public static void main(String[] args) {
        SpringApplication.run(UmpMarketingApplication.class, args);
    }
}
