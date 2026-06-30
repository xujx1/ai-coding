package com.ump.marketing.api.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import javax.validation.constraints.NotBlank;

/**
 * Request payload for soft deleting an activity.
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class DeleteActivityRequest extends BaseRequest {
    private static final long serialVersionUID = 1L;

    /**
     * Activity identifier scoped by region.
     */
    @NotBlank(message = "activityId is required")
    private String activityId;
}
