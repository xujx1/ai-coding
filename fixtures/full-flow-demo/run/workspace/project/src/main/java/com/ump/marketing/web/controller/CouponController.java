package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.*;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.CouponService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/coupon")
public class CouponController {

    @Autowired
    private CouponService couponService;

    @PostMapping("/createTemplate")
    public RpcResult createTemplate(@RequestBody CreateCouponTemplateRequest req) {
        return couponService.createCouponTemplate(req);
    }

    @PostMapping("/issue")
    public RpcResult issue(@RequestBody IssueCouponRequest req) {
        return couponService.issueCoupon(req);
    }

    @PostMapping("/receive")
    public RpcResult receive(@RequestBody ReceiveCouponRequest req) {
        return couponService.receiveCoupon(req);
    }

    @PostMapping("/use")
    public RpcResult use(@RequestBody UseCouponRequest req) {
        return couponService.useCoupon(req);
    }

    @PostMapping("/query")
    public RpcResult query(@RequestBody QueryCouponRequest req) {
        return couponService.queryCoupon(req);
    }
}
