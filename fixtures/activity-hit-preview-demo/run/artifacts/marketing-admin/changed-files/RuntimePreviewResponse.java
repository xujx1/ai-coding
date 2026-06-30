package com.ump.marketing.infrastructure.client.dto;

import com.ump.marketing.api.dto.PreviewActivityDTO;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Internal representation of downstream runtime preview data.
 */
@Data
public class RuntimePreviewResponse implements Serializable {
    private static final long serialVersionUID = 1L;

    private Boolean available = Boolean.TRUE;
    private Boolean hit = Boolean.FALSE;
    private String summary;
    private String queryMode;
    private String reasonCode;
    private String reasonMessage;
    private List<PreviewActivityDTO> activities = new ArrayList<>();
}
