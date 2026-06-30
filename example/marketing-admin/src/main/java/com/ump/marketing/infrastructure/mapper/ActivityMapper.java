package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.Activity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ActivityMapper {

    @Insert("INSERT INTO t_activity(activity_id, tenant_id, activity_name, tool_id, tool_type, threshold_amount, discount_amount, discount_rate, max_discount, coupon_template_id, status, start_time, end_time, scope_type, scope_refs, is_purchase_limited, purchase_limit_per_user, approval_status, approver_id, approval_time, online_time, reject_reason, force_offline_reason, is_deleted, version, region_code, created_at, updated_at, created_by, updated_by) VALUES(#{activityId},#{tenantId},#{activityName},#{toolId},#{toolType},#{thresholdAmount},#{discountAmount},#{discountRate},#{maxDiscount},#{couponTemplateId},#{status},#{startTime},#{endTime},#{scopeType},#{scopeRefs},#{isPurchaseLimited},#{purchaseLimitPerUser},#{approvalStatus},#{approverId},#{approvalTime},#{onlineTime},#{rejectReason},#{forceOfflineReason},#{isDeleted},#{version},#{regionCode},#{createdAt},#{updatedAt},#{createdBy},#{updatedBy})")
    int insert(Activity activity);

    @Select("SELECT * FROM t_activity WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND is_deleted = 0")
    Activity selectByActivityId(@Param("activityId") String activityId, @Param("regionCode") String regionCode);

    @Update("UPDATE t_activity SET status = #{newStatus}, version = #{newVersion}, updated_at = #{updatedAt}, updated_by = #{updatedBy} WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND status = #{oldStatus} AND version = #{oldVersion}")
    int updateStatus(@Param("activityId") String activityId, @Param("regionCode") String regionCode, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("oldVersion") Integer oldVersion, @Param("newVersion") Integer newVersion, @Param("updatedAt") Long updatedAt, @Param("updatedBy") String updatedBy);

    @Update("UPDATE t_activity SET status = #{newStatus}, approver_id = #{approverId}, approval_time = #{approvalTime}, version = #{newVersion}, updated_at = #{updatedAt}, updated_by = #{updatedBy}, reject_reason = #{rejectReason} WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND status = #{oldStatus} AND version = #{oldVersion}")
    int updateStatusWithApproval(@Param("activityId") String activityId, @Param("regionCode") String regionCode, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("approverId") String approverId, @Param("approvalTime") Long approvalTime, @Param("oldVersion") Integer oldVersion, @Param("newVersion") Integer newVersion, @Param("updatedAt") Long updatedAt, @Param("updatedBy") String updatedBy, @Param("rejectReason") String rejectReason);

    @Update("UPDATE t_activity SET status = #{newStatus}, online_time = #{onlineTime}, version = #{newVersion}, updated_at = #{updatedAt}, updated_by = #{updatedBy} WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND status = #{oldStatus} AND version = #{oldVersion}")
    int updateStatusOnline(@Param("activityId") String activityId, @Param("regionCode") String regionCode, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("onlineTime") Long onlineTime, @Param("oldVersion") Integer oldVersion, @Param("newVersion") Integer newVersion, @Param("updatedAt") Long updatedAt, @Param("updatedBy") String updatedBy);

    @Update("UPDATE t_activity SET status = #{newStatus}, force_offline_reason = #{forceOfflineReason}, version = #{newVersion}, updated_at = #{updatedAt}, updated_by = #{updatedBy} WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND status = #{oldStatus} AND version = #{oldVersion}")
    int updateStatusForceOffline(@Param("activityId") String activityId, @Param("regionCode") String regionCode, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("forceOfflineReason") String forceOfflineReason, @Param("oldVersion") Integer oldVersion, @Param("newVersion") Integer newVersion, @Param("updatedAt") Long updatedAt, @Param("updatedBy") String updatedBy);

    @Update("UPDATE t_activity SET activity_name = #{activityName}, threshold_amount = #{thresholdAmount}, discount_amount = #{discountAmount}, discount_rate = #{discountRate}, max_discount = #{maxDiscount}, start_time = #{startTime}, end_time = #{endTime}, scope_type = #{scopeType}, scope_refs = #{scopeRefs}, updated_at = #{updatedAt}, updated_by = #{updatedBy}, version = version + 1 WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND version = #{version} AND is_deleted = 0")
    int updateWithVersion(Activity activity);

    @Update("UPDATE t_activity SET is_deleted = 1, version = version + 1, updated_at = #{updatedAt}, updated_by = #{updatedBy} WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND status = #{status} AND version = #{version} AND is_deleted = 0")
    int softDelete(@Param("activityId") String activityId,
                   @Param("regionCode") String regionCode,
                   @Param("status") String status,
                   @Param("version") Integer version,
                   @Param("updatedAt") Long updatedAt,
                   @Param("updatedBy") String updatedBy);

    @Select("SELECT * FROM t_activity WHERE activity_id = #{activityId} AND region_code = #{regionCode} AND is_deleted = 0 FOR UPDATE")
    Activity selectForUpdate(@Param("activityId") String activityId, @Param("regionCode") String regionCode);

    @Select("SELECT * FROM t_activity WHERE region_code = #{regionCode} AND is_deleted = 0 LIMIT #{limit} OFFSET #{offset}")
    List<Activity> selectList(@Param("regionCode") String regionCode, @Param("limit") int limit, @Param("offset") int offset);
}
