package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class PublishSyncEventRequest extends BaseRequest {
    private static final long serialVersionUID = 1L;
    private String eventType;
    private String aggregateType;
    private String aggregateId;
    private String payload;
    private Long version;
}
