package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.CouponBatch;
import org.apache.ibatis.annotations.*;

@Mapper
public interface CouponBatchMapper {

    @Insert("INSERT INTO t_coupon_batch(batch_id, template_id, batch_name, total_count, issued_count, received_count, used_count, status, region_code, is_deleted, version, created_at, updated_at, created_by, updated_by) VALUES(#{batchId},#{templateId},#{batchName},#{totalCount},#{issuedCount},#{receivedCount},#{usedCount},#{status},#{regionCode},#{isDeleted},#{version},#{createdAt},#{updatedAt},#{createdBy},#{updatedBy})")
    int insert(CouponBatch batch);

    @Select("SELECT * FROM t_coupon_batch WHERE batch_id = #{batchId} AND region_code = #{regionCode}")
    CouponBatch selectByBatchId(@Param("batchId") String batchId, @Param("regionCode") String regionCode);

    @Update("UPDATE t_coupon_batch SET issued_count = issued_count + #{count}, updated_at = #{updatedAt} WHERE template_id = #{templateId} AND region_code = #{regionCode}")
    int incrementIssuedCount(@Param("templateId") String templateId, @Param("regionCode") String regionCode, @Param("count") int count, @Param("updatedAt") Long updatedAt);

    @Update("UPDATE t_coupon_batch SET received_count = received_count + #{count}, updated_at = #{updatedAt} WHERE template_id = #{templateId} AND region_code = #{regionCode}")
    int incrementReceivedCount(@Param("templateId") String templateId, @Param("regionCode") String regionCode, @Param("count") int count, @Param("updatedAt") Long updatedAt);

    @Update("UPDATE t_coupon_batch SET used_count = used_count + #{count}, updated_at = #{updatedAt} WHERE template_id = #{templateId} AND region_code = #{regionCode}")
    int incrementUsedCount(@Param("templateId") String templateId, @Param("regionCode") String regionCode, @Param("count") int count, @Param("updatedAt") Long updatedAt);
}
