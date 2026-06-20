package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.ActivityScope;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ActivityScopeMapper {

    @Insert("INSERT INTO t_activity_scope(activity_id, scope_key, scope_type, product_id, sku_id, status, region_code, is_deleted, version, created_at, updated_at, created_by, updated_by) VALUES(#{activityId},#{scopeKey},#{scopeType},#{productId},#{skuId},#{status},#{regionCode},#{isDeleted},#{version},#{createdAt},#{updatedAt},#{createdBy},#{updatedBy})")
    int insert(ActivityScope scope);

    @Select("SELECT * FROM t_activity_scope WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND is_deleted = 0")
    List<ActivityScope> selectByActivityId(@Param("activityId") String activityId, @Param("regionCode") String regionCode);

    @Select("SELECT * FROM t_activity_scope WHERE scope_key = #{scopeKey} AND activity_id = #{activityId} AND region_code = #{regionCode} AND is_deleted = 0")
    ActivityScope selectByScopeKey(@Param("scopeKey") String scopeKey, @Param("activityId") String activityId, @Param("regionCode") String regionCode);

    @Update("UPDATE t_activity_scope SET is_deleted = 1, updated_at = #{updatedAt} WHERE id = #{id} AND region_code = #{regionCode}")
    int softDelete(@Param("id") Long id, @Param("regionCode") String regionCode, @Param("updatedAt") Long updatedAt);

    @Update("UPDATE t_activity_scope SET is_deleted = 1, updated_at = #{updatedAt}, updated_by = #{updatedBy} WHERE scope_key = #{scopeKey} AND activity_id = #{activityId} AND region_code = #{regionCode}")
    int deleteByScopeKey(@Param("scopeKey") String scopeKey, @Param("activityId") String activityId, @Param("regionCode") String regionCode, @Param("updatedAt") Long updatedAt, @Param("updatedBy") String updatedBy);
}
