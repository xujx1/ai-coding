package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.ActivityTool;
import org.apache.ibatis.annotations.*;

@Mapper
public interface ActivityToolMapper {

    @Insert("INSERT INTO t_activity_tool(tool_id, tenant_id, tool_name, tool_type, tool_description, exclusion_rules, priority, status, region_code, is_deleted, version, created_at, updated_at, created_by, updated_by) VALUES(#{toolId},#{tenantId},#{toolName},#{toolType},#{toolDescription},#{exclusionRules},#{priority},#{status},#{regionCode},#{isDeleted},#{version},#{createdAt},#{updatedAt},#{createdBy},#{updatedBy})")
    int insert(ActivityTool tool);

    @Select("SELECT * FROM t_activity_tool WHERE tool_id = #{toolId} AND region_code = #{regionCode}")
    ActivityTool selectByToolId(@Param("toolId") String toolId, @Param("regionCode") String regionCode);
}
