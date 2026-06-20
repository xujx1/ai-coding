package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class SyncEventDTO implements Serializable {
    private static final long serialVersionUID = 1L;
    private String eventId;
    private String eventType;
    private String aggregateType;
    private String aggregateId;
    private String regionCode;
    private Long version;
    private String payload;
    private Long occurredAt;
}
