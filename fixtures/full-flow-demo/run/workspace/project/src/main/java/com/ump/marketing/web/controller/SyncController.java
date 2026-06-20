package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.PublishSyncEventRequest;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.SyncService;
import com.ump.marketing.infrastructure.dlq.DlqService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    @Autowired
    private SyncService syncService;

    @Autowired
    private DlqService dlqService;

    @PostMapping("/publishEvent")
    public RpcResult publishEvent(@RequestBody PublishSyncEventRequest req) {
        return syncService.publishSyncEvent(req);
    }

    @PostMapping("/retryDlq")
    public RpcResult retryDlq() {
        dlqService.processRetries();
        return RpcResult.success("triggered", null);
    }

    @PostMapping("/manualReplay")
    public RpcResult manualReplay(@RequestParam String eventId) {
        dlqService.manualReplay(eventId);
        return RpcResult.success(true, null);
    }
}
