package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.CouponInstance;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface CouponInstanceMapper {

    int insert(@Param("tableSuffix") String tableSuffix, @Param("record") CouponInstance record);

    CouponInstance selectByCouponInstId(@Param("tableSuffix") String tableSuffix, @Param("couponInstId") String couponInstId, @Param("regionCode") String regionCode);

    List<CouponInstance> selectByUserId(@Param("tableSuffix") String tableSuffix, @Param("userId") String userId, @Param("regionCode") String regionCode);

    /**
     * Update status only (e.g. ISSUED -> RECEIVED). Sets updatedAt but not orderId/usedAt.
     */
    int updateStatus(@Param("tableSuffix") String tableSuffix, @Param("couponInstId") String couponInstId, @Param("userId") String userId, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("updatedAt") Long updatedAt, @Param("regionCode") String regionCode);

    /**
     * Update status with orderId and usedAt (RECEIVED -> USED).
     */
    int updateStatusWithOrder(@Param("tableSuffix") String tableSuffix, @Param("couponInstId") String couponInstId, @Param("userId") String userId, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("orderId") String orderId, @Param("usedAt") Long usedAt, @Param("updatedAt") Long updatedAt, @Param("regionCode") String regionCode);

    int countByTemplateAndUser(@Param("tableSuffix") String tableSuffix, @Param("templateId") String templateId, @Param("userId") String userId, @Param("regionCode") String regionCode);

    int refund(@Param("tableSuffix") String tableSuffix, @Param("couponInstId") String couponInstId, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("orderId") String orderId, @Param("updatedAt") Long updatedAt, @Param("regionCode") String regionCode);
}
