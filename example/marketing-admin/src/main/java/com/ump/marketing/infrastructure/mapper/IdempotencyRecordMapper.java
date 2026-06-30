package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.IdempotencyRecord;
import org.apache.ibatis.annotations.*;

@Mapper
public interface IdempotencyRecordMapper {

    @Insert("INSERT INTO t_idempotency_record(idempotency_key, request_hash, response_json, status, region_code, created_at, expired_at) VALUES(#{idempotencyKey},#{requestHash},#{responseJson},#{status},#{regionCode},#{createdAt},#{expiredAt})")
    int insert(IdempotencyRecord record);

    @Select("SELECT * FROM t_idempotency_record WHERE idempotency_key = #{key} AND region_code = #{regionCode}")
    IdempotencyRecord selectByKey(@Param("key") String key, @Param("regionCode") String regionCode);

    @Update("UPDATE t_idempotency_record SET status = #{status}, response_json = #{responseJson} WHERE idempotency_key = #{key} AND region_code = #{regionCode}")
    int updateStatus(@Param("key") String key, @Param("regionCode") String regionCode, @Param("status") String status, @Param("responseJson") String responseJson);
}
