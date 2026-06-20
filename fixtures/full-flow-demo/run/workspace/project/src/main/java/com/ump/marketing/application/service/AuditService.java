package com.ump.marketing.application.service;

import com.ump.marketing.domain.model.OperationAuditLog;
import com.ump.marketing.infrastructure.config.IdGenerator;
import com.ump.marketing.infrastructure.mapper.OperationAuditLogMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Writes audit logs for all state changes across aggregates for traceability and compliance.
 */
@Service
public class AuditService {

    @Autowired
    private OperationAuditLogMapper auditLogMapper;

    @Autowired
    private IdGenerator idGenerator;

    /**
     * Log a state change event for an aggregate.
     *
     * @param requestId      the originating request ID for correlation
     * @param operator       the operator (user or system) who triggered the change
     * @param operationType  the type of operation (e.g. CREATE_ACTIVITY, APPROVE)
     * @param aggregateType  the aggregate root type (e.g. Activity, CouponInstance)
     * @param aggregateId    the ID of the aggregate being modified
     * @param regionCode     the region code for data residency
     * @param beforeSnapshot JSON snapshot of the aggregate before the change
     * @param afterSnapshot  JSON snapshot of the aggregate after the change
     */
    public void logStateChange(String requestId, String operator, String operationType,
                               String aggregateType, String aggregateId, String regionCode,
                               String beforeSnapshot, String afterSnapshot) {
        OperationAuditLog log = new OperationAuditLog();
        log.setTraceId(idGenerator.generateId("trace"));
        log.setRequestId(requestId);
        log.setOperator(operator);
        log.setOperationType(operationType);
        log.setAggregateType(aggregateType);
        log.setAggregateId(aggregateId);
        log.setRegionCode(regionCode);
        log.setBeforeSnapshot(beforeSnapshot);
        log.setAfterSnapshot(afterSnapshot);
        log.setCreatedAt(System.currentTimeMillis());
        auditLogMapper.insert(log);
    }
}
