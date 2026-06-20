package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.ScopeActivity;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ScopeActivityMapper {

    int insert(@Param("tableSuffix") String tableSuffix, @Param("record") ScopeActivity record);

    ScopeActivity selectByScopeKey(@Param("tableSuffix") String tableSuffix, @Param("scopeKey") String scopeKey, @Param("regionCode") String regionCode);

    List<ScopeActivity> selectActiveByScopeKey(@Param("tableSuffix") String tableSuffix, @Param("scopeKey") String scopeKey, @Param("regionCode") String regionCode);

    int updateStatus(@Param("tableSuffix") String tableSuffix, @Param("scopeKey") String scopeKey, @Param("activityId") String activityId, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("regionCode") String regionCode, @Param("updatedAt") Long updatedAt);

    int deleteByActivityId(@Param("tableSuffix") String tableSuffix, @Param("activityId") String activityId, @Param("regionCode") String regionCode, @Param("updatedAt") Long updatedAt);

    int deleteByScopeKey(@Param("tableSuffix") String tableSuffix, @Param("scopeKey") String scopeKey, @Param("activityId") String activityId, @Param("regionCode") String regionCode, @Param("updatedAt") Long updatedAt);
}
