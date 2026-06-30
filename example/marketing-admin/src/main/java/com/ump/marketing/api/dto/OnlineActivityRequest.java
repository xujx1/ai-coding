package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class OnlineActivityRequest extends BaseRequest {
    private static final long serialVersionUID = 1L;
    private String activityId;
}
