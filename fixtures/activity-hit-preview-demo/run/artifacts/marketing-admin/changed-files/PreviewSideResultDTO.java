package com.ump.marketing.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Encapsulates preview results for one source side.
 */
@Data
public class PreviewSideResultDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String side;
    private Boolean hit;
    private Boolean available;
    private String summary;
    private String queryMode;
    private String reasonCode;
    private String reasonMessage;
    private List<PreviewActivityDTO> activities = new ArrayList<>();
    private List<PreviewHintDTO> hints = new ArrayList<>();
}
