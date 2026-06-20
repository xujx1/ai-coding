package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.OperationAuditLog;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface OperationAuditLogMapper {

    @Insert("INSERT INTO t_operation_audit_log(trace_id, request_id, operator, operation_type, aggregate_type, aggregate_id, region_code, before_snapshot, after_snapshot, created_at) VALUES(#{traceId},#{requestId},#{operator},#{operationType},#{aggregateType},#{aggregateId},#{regionCode},#{beforeSnapshot},#{afterSnapshot},#{createdAt})")
    int insert(OperationAuditLog log);

    @Select("SELECT * FROM t_operation_audit_log WHERE aggregate_id = #{aggregateId} AND region_code = #{regionCode} ORDER BY created_at DESC")
    List<OperationAuditLog> selectByAggregateId(@Param("aggregateId") String aggregateId, @Param("regionCode") String regionCode);
}
