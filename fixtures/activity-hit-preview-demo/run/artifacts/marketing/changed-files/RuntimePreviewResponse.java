package com.ump.marketing.api.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * Runtime preview response payload.
 */
public class RuntimePreviewResponse {

    private boolean hit;
    private String matchedDimension;
    private String scopeKey;
    private List<RuntimePreviewHitDTO> activities = new ArrayList<RuntimePreviewHitDTO>();
    private List<String> missReasonCodes = new ArrayList<String>();
    private List<String> syncHints = new ArrayList<String>();

    public boolean isHit() {
        return hit;
    }

    public void setHit(boolean hit) {
        this.hit = hit;
    }

    public String getMatchedDimension() {
        return matchedDimension;
    }

    public void setMatchedDimension(String matchedDimension) {
        this.matchedDimension = matchedDimension;
    }

    public String getScopeKey() {
        return scopeKey;
    }

    public void setScopeKey(String scopeKey) {
        this.scopeKey = scopeKey;
    }

    public List<RuntimePreviewHitDTO> getActivities() {
        return activities;
    }

    public void setActivities(List<RuntimePreviewHitDTO> activities) {
        this.activities = activities;
    }

    public List<String> getMissReasonCodes() {
        return missReasonCodes;
    }

    public void setMissReasonCodes(List<String> missReasonCodes) {
        this.missReasonCodes = missReasonCodes;
    }

    public List<String> getSyncHints() {
        return syncHints;
    }

    public void setSyncHints(List<String> syncHints) {
        this.syncHints = syncHints;
    }
}
