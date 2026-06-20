package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.SyncEventLog;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SyncEventLogMapper {

    @Insert("INSERT INTO t_sync_event_log(event_id, event_type, aggregate_id, aggregate_type, region_code, version, payload, consumer_group, consume_status, error_message, retry_count, next_retry_at, occurred_at, created_at, updated_at) VALUES(#{eventId},#{eventType},#{aggregateId},#{aggregateType},#{regionCode},#{version},#{payload},#{consumerGroup},#{consumeStatus},#{errorMessage},#{retryCount},#{nextRetryAt},#{occurredAt},#{createdAt},#{updatedAt})")
    int insert(SyncEventLog log);

    @Select("SELECT * FROM t_sync_event_log WHERE event_id = #{eventId}")
    SyncEventLog selectByEventId(@Param("eventId") String eventId);

    @Update("UPDATE t_sync_event_log SET consume_status = #{consumeStatus}, error_message = #{errorMessage}, retry_count = #{retryCount}, next_retry_at = #{nextRetryAt}, updated_at = #{updatedAt} WHERE event_id = #{eventId}")
    int updateStatus(@Param("eventId") String eventId, @Param("consumeStatus") String consumeStatus, @Param("errorMessage") String errorMessage, @Param("retryCount") int retryCount, @Param("nextRetryAt") Long nextRetryAt, @Param("updatedAt") Long updatedAt);

    @Select("SELECT * FROM t_sync_event_log WHERE consume_status IN ('PENDING','DLQ') AND next_retry_at <= #{now} AND retry_count < 10 LIMIT 100")
    List<SyncEventLog> selectRetryable(@Param("now") Long now);
}
