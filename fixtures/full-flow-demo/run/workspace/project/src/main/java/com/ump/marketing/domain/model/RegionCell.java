package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class RegionCell {

    private Long id;
    private String regionCode;
    private String regionName;
    private String dbShardKey;
    private String redisNamespace;
    private String kafkaTopicPrefix;
    private String currency;
    private String language;
    private String status;
    private Boolean isDeleted = false;
    private Integer version = 0;
    private Long createdAt;
    private Long updatedAt;
    private String createdBy;
    private String updatedBy;
}
