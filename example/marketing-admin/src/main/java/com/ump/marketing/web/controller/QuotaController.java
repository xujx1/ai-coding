package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.*;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.QuotaService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/quota")
public class QuotaController {

    @Autowired
    private QuotaService quotaService;

    @PostMapping("/occupy")
    public RpcResult occupy(@RequestBody OccupyQuotaRequest req) {
        return quotaService.occupyQuota(req);
    }

    @PostMapping("/release")
    public RpcResult release(@RequestBody ReleaseQuotaRequest req) {
        return quotaService.releaseQuota(req);
    }

    @PostMapping("/confirm")
    public RpcResult confirm(@RequestBody ConfirmQuotaRequest req) {
        return quotaService.confirmQuota(req);
    }
}
