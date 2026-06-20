package com.ump.marketing.application.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ump.marketing.api.enums.ErrorCode;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.domain.model.IdempotencyRecord;
import com.ump.marketing.infrastructure.mapper.IdempotencyRecordMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Handles idempotency checks for all write operations to prevent duplicate processing.
 */
@Service
public class IdempotencyService {

    private final IdempotencyRecordMapper idempotencyRecordMapper;
    private final ObjectMapper objectMapper;

    public IdempotencyService(IdempotencyRecordMapper idempotencyRecordMapper,
                              @Autowired(required = false) ObjectMapper objectMapper) {
        this.idempotencyRecordMapper = idempotencyRecordMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * Check if request already processed. Returns the cached response if same key+hash exists.
     * Throws IDEMPOTENCY_CONFLICT if same key but different hash.
     * Returns null if this is a new request (caller should proceed with business logic).
     *
     * @param idempotencyKey the idempotency key from the request
     * @param regionCode     the region code for sharding
     * @param requestHash    hash of the request body for conflict detection
     * @param ttlDays        time-to-live in days for the record
     * @return cached RpcResult if duplicate, null if new request should proceed
     */
    @SuppressWarnings("unchecked")
    public <T> RpcResult<T> checkAndRecord(String idempotencyKey, String regionCode,
                                           String requestHash, int ttlDays) {
        return checkAndRecord(idempotencyKey, regionCode, requestHash, ttlDays, null);
    }

    /**
     * Check if request already processed and, if so, replay the first result with the current request ID.
     */
    @SuppressWarnings("unchecked")
    public <T> RpcResult<T> checkAndRecord(String idempotencyKey, String regionCode,
                                           String requestHash, int ttlDays, String requestId) {
        if (idempotencyKey == null || idempotencyKey.isEmpty()) {
            return null;
        }

        String normalizedRequestHash = sha256Hex(canonicalizeRequestHash(requestHash));
        IdempotencyRecord existing = idempotencyRecordMapper.selectByKey(idempotencyKey, regionCode);
        if (existing != null) {
            if (!normalizedRequestHash.equals(existing.getRequestHash())
                    && !requestHashEquals(requestHash, existing.getRequestHash())) {
                return RpcResult.fail(ErrorCode.IDEMPOTENCY_CONFLICT, "Idempotency key conflict", requestId);
            }
            if (IdempotencyRecord.STATUS_SUCCESS.equals(existing.getStatus())) {
                return replayResponse(existing.getResponseJson(), requestId);
            }
            return RpcResult.fail(ErrorCode.IDEMPOTENCY_CONFLICT, "Request is already being processed", requestId);
        }

        IdempotencyRecord record = new IdempotencyRecord();
        record.setIdempotencyKey(idempotencyKey);
        record.setRequestHash(normalizedRequestHash);
        record.setStatus(IdempotencyRecord.STATUS_PROCESSING);
        record.setRegionCode(regionCode);
        record.setCreatedAt(System.currentTimeMillis());
        record.setExpiredAt(System.currentTimeMillis() + (long) ttlDays * 86400000L);
        idempotencyRecordMapper.insert(record);

        return null;
    }

    /**
     * Mark an idempotent record as completed after successful processing.
     *
     * @param idempotencyKey the idempotency key
     * @param regionCode     the region code
     * @param responseJson   serialized response JSON for replay
     */
    public void markCompleted(String idempotencyKey, String regionCode, String responseJson) {
        if (idempotencyKey == null || idempotencyKey.isEmpty()) {
            return;
        }
        idempotencyRecordMapper.updateStatus(idempotencyKey, regionCode,
                IdempotencyRecord.STATUS_SUCCESS, responseJson);
    }

    private boolean requestHashEquals(String requestHash, String existingHash) {
        return requestHash == null ? existingHash == null : requestHash.equals(existingHash);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                String part = Integer.toHexString(b & 0xff);
                if (part.length() == 1) {
                    hex.append('0');
                }
                hex.append(part);
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm is not available", e);
        }
    }

    private String canonicalizeRequestHash(String requestHash) {
        if (requestHash == null || objectMapper == null) {
            return requestHash;
        }
        try {
            JsonNode root = objectMapper.readTree(requestHash);
            if (root instanceof ObjectNode) {
                ObjectNode objectNode = (ObjectNode) root;
                objectNode.remove("requestId");
                objectNode.remove("timestampMs");
                return objectMapper.writeValueAsString(objectNode);
            }
        } catch (Exception ignored) {
            // Non-JSON callers can still use the raw value as the idempotency fingerprint input.
        }
        return requestHash;
    }

    private <T> RpcResult<T> replayResponse(String responseJson, String requestId) {
        if (responseJson == null || responseJson.isEmpty() || objectMapper == null) {
            return RpcResult.success(null, requestId);
        }
        try {
            JsonNode root = objectMapper.readTree(responseJson);
            int code = root.path("code").asInt(ErrorCode.SUCCESS.getCode());
            String message = root.path("message").asText(ErrorCode.SUCCESS.getMessage());
            JsonNode dataNode = root.get("data");
            Object data = dataNode == null || dataNode.isNull() ? null : objectMapper.treeToValue(dataNode, Object.class);
            return new RpcResult<>(code, message, requestId, (T) data);
        } catch (Exception ignored) {
            return RpcResult.success(null, requestId);
        }
    }
}
