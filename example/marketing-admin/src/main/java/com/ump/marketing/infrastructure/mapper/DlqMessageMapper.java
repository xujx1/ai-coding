package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.DlqMessage;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface DlqMessageMapper {

    @Insert("INSERT INTO t_dlq_message(event_id, topic, consumer_group, payload, status, retry_count, next_retry_at, error_message, region_code, created_at, updated_at) VALUES(#{eventId},#{topic},#{consumerGroup},#{payload},#{status},#{retryCount},#{nextRetryAt},#{errorMessage},#{regionCode},#{createdAt},#{updatedAt})")
    int insert(DlqMessage msg);

    @Select("SELECT * FROM t_dlq_message WHERE status = 'RETRYABLE' AND next_retry_at <= #{now} AND retry_count < 10 LIMIT 100")
    List<DlqMessage> selectRetryable(@Param("now") Long now);

    @Update("UPDATE t_dlq_message SET retry_count = #{retryCount}, next_retry_at = #{nextRetryAt}, status = #{status}, updated_at = #{updatedAt} WHERE id = #{id}")
    int updateRetryStatus(@Param("id") Long id, @Param("retryCount") int retryCount, @Param("nextRetryAt") Long nextRetryAt, @Param("status") String status, @Param("updatedAt") Long updatedAt);

    @Select("SELECT * FROM t_dlq_message WHERE event_id = #{eventId}")
    DlqMessage selectByEventId(@Param("eventId") String eventId);

    @Update("UPDATE t_dlq_message SET status = #{status}, updated_at = #{updatedAt} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status, @Param("updatedAt") Long updatedAt);
}
