package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class SyncEvent {

    private String eventId;
    private String eventType;
    private String aggregateType;
    private String aggregateId;
    private String regionCode;
    private Long version;
    private String payload;
    private Long occurredAt;

    public static SyncEvent of(String eventId, String eventType, String aggregateType,
                               String aggregateId, String regionCode, Long version,
                               String payload, Long occurredAt) {
        SyncEvent event = new SyncEvent();
        event.setEventId(eventId);
        event.setEventType(eventType);
        event.setAggregateType(aggregateType);
        event.setAggregateId(aggregateId);
        event.setRegionCode(regionCode);
        event.setVersion(version);
        event.setPayload(payload);
        event.setOccurredAt(occurredAt);
        return event;
    }
}
