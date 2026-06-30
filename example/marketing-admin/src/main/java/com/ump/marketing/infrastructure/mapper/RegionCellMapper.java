package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.RegionCell;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface RegionCellMapper {

    @Insert("INSERT INTO t_region_cell(region_code, region_name, db_shard_key, redis_namespace, kafka_topic_prefix, currency, language, status, is_deleted, version, created_at, updated_at, created_by, updated_by) VALUES(#{regionCode},#{regionName},#{dbShardKey},#{redisNamespace},#{kafkaTopicPrefix},#{currency},#{language},#{status},#{isDeleted},#{version},#{createdAt},#{updatedAt},#{createdBy},#{updatedBy})")
    int insert(RegionCell cell);

    @Select("SELECT * FROM t_region_cell WHERE region_code = #{regionCode}")
    RegionCell selectByRegionCode(@Param("regionCode") String regionCode);

    @Select("SELECT * FROM t_region_cell")
    List<RegionCell> selectAll();
}
