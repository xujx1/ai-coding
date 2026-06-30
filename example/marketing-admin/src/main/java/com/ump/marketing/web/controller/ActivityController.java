package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.ActivityDTO;
import com.ump.marketing.api.dto.ApproveActivityRequest;
import com.ump.marketing.api.dto.CreateActivityRequest;
import com.ump.marketing.api.dto.DeleteActivityRequest;
import com.ump.marketing.api.dto.ForceOfflineRequest;
import com.ump.marketing.api.dto.OnlineActivityRequest;
import com.ump.marketing.api.dto.PauseActivityRequest;
import com.ump.marketing.api.dto.RejectActivityRequest;
import com.ump.marketing.api.dto.SubmitApprovalRequest;
import com.ump.marketing.api.dto.UpdateActivityRequest;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.ActivityService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.validation.Valid;

/**
 * REST endpoints for activity lifecycle operations.
 */
@RestController
@RequestMapping("/api/activity")
public class ActivityController {

    private final ActivityService activityService;

    public ActivityController(ActivityService activityService) {
        this.activityService = activityService;
    }

    @PostMapping("/create")
    public RpcResult<ActivityDTO> create(@RequestBody CreateActivityRequest req) {
        return activityService.createActivity(req);
    }

    @PostMapping("/update")
    public RpcResult<ActivityDTO> update(@RequestBody UpdateActivityRequest req) {
        return activityService.updateActivity(req);
    }

    @PostMapping("/submitApproval")
    public RpcResult<ActivityDTO> submitApproval(@RequestBody SubmitApprovalRequest req) {
        return activityService.submitForApproval(req);
    }

    @PostMapping("/approve")
    public RpcResult<ActivityDTO> approve(@RequestBody ApproveActivityRequest req) {
        return activityService.approveActivity(req);
    }

    @PostMapping("/reject")
    public RpcResult<ActivityDTO> reject(@RequestBody RejectActivityRequest req) {
        return activityService.rejectActivity(req);
    }

    @PostMapping("/online")
    public RpcResult<ActivityDTO> online(@RequestBody OnlineActivityRequest req) {
        return activityService.onlineActivity(req);
    }

    @PostMapping("/pause")
    public RpcResult<ActivityDTO> pause(@RequestBody PauseActivityRequest req) {
        return activityService.pauseActivity(req);
    }

    @PostMapping("/forceOffline")
    public RpcResult<Void> forceOffline(@RequestBody ForceOfflineRequest req) {
        return activityService.forceOfflineActivity(req);
    }

    @PostMapping("/delete")
    public RpcResult<Void> delete(@Valid @RequestBody DeleteActivityRequest req) {
        return activityService.deleteActivity(req);
    }
}
