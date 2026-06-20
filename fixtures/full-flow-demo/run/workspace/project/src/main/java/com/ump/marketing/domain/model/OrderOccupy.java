package com.ump.marketing.domain.model;

import lombok.Data;

@Data
public class OrderOccupy {

    private String id;
    private String orderId;
    private String userId;
    private String activityId;
    /**
     * OCCUPIED / RELEASED / CONFIRMED
     */
    private String status;
    private Integer quantity;
    private String regionCode;
    private Long releasedAt;
    private Long confirmedAt;
    private Long createdAt;
    private Long updatedAt;

    /**
     * Returns a deterministic unique key joining regionCode, orderId, userId, activityId by ":"
     */
    public static String ukOrder(String regionCode, String orderId, String userId, String activityId) {
        return regionCode + ":" + orderId + ":" + userId + ":" + activityId;
    }
}
