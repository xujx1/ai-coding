package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.api.dto.PreviewActivityDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Queries management-side activity hit candidates for preview.
 */
@Mapper
public interface PreviewQueryMapper {

    /**
     * Finds matching activities by product or sku binding.
     */
    List<PreviewActivityDTO> selectActivities(@Param("regionCode") String regionCode,
                                              @Param("productId") String productId,
                                              @Param("skuId") String skuId,
                                              @Param("scopeType") String scopeType,
                                              @Param("queryBySku") boolean queryBySku);
}
