package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * Describes a diagnostic hint returned by the preview flow.
 */
@Data
public class PreviewHintDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String code;
    private String category;
    private String title;
    private String detail;
    private String message;
}
