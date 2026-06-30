package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class QuotaResultDTO implements Serializable {
    private static final long serialVersionUID = 1L;
    private String id;
    private String orderId;
    private String activityId;
    private String userId;
    private String regionCode;
    private String status;
    private Integer quantity;
    private Long occupyAt;
    private Long releasedAt;
    private Long confirmedAt;
}
