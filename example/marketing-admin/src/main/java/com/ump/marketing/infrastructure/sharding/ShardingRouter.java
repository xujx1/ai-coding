package com.ump.marketing.infrastructure.sharding;

import com.ump.marketing.domain.service.ScopeKeyGenerator;
import org.springframework.stereotype.Component;

/**
 * Routes sharding keys to the correct numbered table suffix for horizontally-sharded tables.
 * <p>
 * Table counts:
 * <ul>
 *   <li>t_scope_act: 16 shards (keyed by scope_key)</li>
 *   <li>t_coupon_inst: 64 shards (keyed by user_id)</li>
 *   <li>t_order_occur: 32 shards (keyed by order_id)</li>
 * </ul>
 */
@Component
public class ShardingRouter {
    private static final int SCOPE_ACT_TABLE_COUNT = 16;
    private static final int COUPON_INST_TABLE_COUNT = 64;
    private static final int ORDER_OCCUR_TABLE_COUNT = 32;

    // Route t_scope_act by scope_key
    public String routeScopeActTable(String regionCode, String scopeKey) {
        int idx = ScopeKeyGenerator.routeTableIndex(regionCode, scopeKey, SCOPE_ACT_TABLE_COUNT);
        return String.format("%02d", idx);
    }

    // Route t_coupon_inst by user_id
    public String routeCouponInstTable(String regionCode, String userId) {
        int idx = ScopeKeyGenerator.routeTableIndex(regionCode, userId, COUPON_INST_TABLE_COUNT);
        return String.format("%02d", idx);
    }

    // Route t_order_occur by order_id
    public String routeOrderOccurTable(String regionCode, String orderId) {
        int idx = ScopeKeyGenerator.routeTableIndex(regionCode, orderId, ORDER_OCCUR_TABLE_COUNT);
        return String.format("%02d", idx);
    }
}
