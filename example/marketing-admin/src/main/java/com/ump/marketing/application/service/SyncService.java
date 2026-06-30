package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ump.marketing.api.dto.PublishSyncEventRequest;
import com.ump.marketing.api.dto.SyncEventDTO;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.service.RuleValidator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Application service for the Sync bounded context.
 * Provides a generic entry point for publishing B-to-C sync events,
 * used by internal callers and cross-aggregate event propagation.
 */
@Service
public class SyncService {

    private static final int IDEMPOTENCY_TTL_DAYS = 3;

    @Autowired
    private SyncEventPublisher syncEventPublisher;

    @Autowired
    private IdempotencyService idempotencyService;

    @Autowired(required = false)
    private ObjectMapper objectMapper;

    /**
     * Publish a generic sync event to the B-to-C Kafka topic.
     * Validates required fields, performs idempotency checks, and delegates
     * to SyncEventPublisher for reliable Kafka dispatch with DLQ fallback.
     *
     * @param req the publish request containing event metadata and payload
     * @return SyncEventDTO with the generated event ID and event metadata
     */
    public RpcResult<SyncEventDTO> publishSyncEvent(PublishSyncEventRequest req) {
        RuleValidator.validateRegionCode(req.getRegionCode());
        RuleValidator.validateIdempotencyKey(req.getIdempotencyKey());

        if (req.getEventType() == null || req.getEventType().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "eventType is required", req.getRequestId());
        }
        if (req.getAggregateType() == null || req.getAggregateType().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "aggregateType is required", req.getRequestId());
        }
        if (req.getAggregateId() == null || req.getAggregateId().isEmpty()) {
            return RpcResult.fail(ErrorCode.INVALID_ARGUMENT, "aggregateId is required", req.getRequestId());
        }

        String requestHash = toJson(req);
        @SuppressWarnings("unchecked")
        RpcResult<SyncEventDTO> cached = idempotencyService.checkAndRecord(
                req.getIdempotencyKey(), req.getRegionCode(), requestHash, IDEMPOTENCY_TTL_DAYS);
        if (cached != null) {
            return cached;
        }

        String payload = req.getPayload() != null ? req.getPayload() : "{}";
        Long version = req.getVersion() != null ? req.getVersion() : 0L;

        String eventId = syncEventPublisher.publishEvent(
                req.getEventType(),
                req.getAggregateType(),
                req.getAggregateId(),
                req.getRegionCode(),
                version,
                payload);

        SyncEventDTO dto = new SyncEventDTO();
        dto.setEventId(eventId);
        dto.setEventType(req.getEventType());
        dto.setAggregateType(req.getAggregateType());
        dto.setAggregateId(req.getAggregateId());
        dto.setRegionCode(req.getRegionCode());
        dto.setVersion(version);
        dto.setPayload(payload);
        dto.setOccurredAt(System.currentTimeMillis());

        idempotencyService.markCompleted(req.getIdempotencyKey(), req.getRegionCode(), toJson(dto));

        return RpcResult.success(dto, req.getRequestId());
    }

    private String toJson(Object obj) {
        if (obj == null) {
            return "null";
        }
        try {
            return objectMapper != null ? objectMapper.writeValueAsString(obj) : String.valueOf(obj);
        } catch (Exception e) {
            return String.valueOf(obj);
        }
    }
}
