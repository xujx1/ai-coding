package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.CouponTemplate;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface CouponTemplateMapper {

    @Insert("INSERT INTO t_coupon_template(template_id, activity_id, template_name, coupon_type, face_value, min_amount, total_count, remain_count, per_user_limit, valid_start_time, valid_end_time, region_code, status, is_deleted, version, created_at, updated_at, created_by, updated_by) VALUES(#{templateId},#{activityId},#{templateName},#{couponType},#{faceValue},#{minAmount},#{totalCount},#{remainCount},#{perUserLimit},#{validStartTime},#{validEndTime},#{regionCode},#{status},#{isDeleted},#{version},#{createdAt},#{updatedAt},#{createdBy},#{updatedBy})")
    int insert(CouponTemplate template);

    @Select("SELECT * FROM t_coupon_template WHERE template_id = #{templateId} AND region_code = #{regionCode}")
    CouponTemplate selectByTemplateId(@Param("templateId") String templateId, @Param("regionCode") String regionCode);

    @Select("SELECT * FROM t_coupon_template WHERE activity_id = #{activityId} AND region_code = #{regionCode}")
    List<CouponTemplate> selectByActivityId(@Param("activityId") String activityId, @Param("regionCode") String regionCode);

    @Update("UPDATE t_coupon_template SET remain_count = #{newRemainCount}, version = version + 1, updated_at = #{updatedAt} WHERE template_id = #{templateId} AND region_code = #{regionCode} AND remain_count = #{oldRemainCount}")
    int updateRemainCount(@Param("templateId") String templateId, @Param("regionCode") String regionCode, @Param("oldRemainCount") int oldRemainCount, @Param("newRemainCount") int newRemainCount, @Param("updatedAt") Long updatedAt);
}
