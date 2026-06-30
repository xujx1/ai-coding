package com.ump.marketing.infrastructure.mapper;

import com.ump.marketing.domain.model.OrderOccupy;
import org.apache.ibatis.annotations.*;

@Mapper
public interface OrderOccupyMapper {

    int insert(@Param("tableSuffix") String tableSuffix, @Param("record") OrderOccupy record);

    OrderOccupy selectByUkOrder(@Param("tableSuffix") String tableSuffix, @Param("regionCode") String regionCode, @Param("orderId") String orderId, @Param("userId") String userId, @Param("activityId") String activityId);

    int updateStatus(@Param("tableSuffix") String tableSuffix, @Param("id") String id, @Param("regionCode") String regionCode, @Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus, @Param("quantity") Integer quantity, @Param("updatedAt") Long updatedAt);
}
