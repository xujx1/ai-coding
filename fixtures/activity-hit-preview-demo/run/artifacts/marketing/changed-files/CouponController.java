package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.UseCouponRequest;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.CouponService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Coupon runtime endpoints.
 */
@RestController
@RequestMapping("/api/coupon")
public class CouponController {

    private final CouponService couponService;

    public CouponController(CouponService couponService) {
        this.couponService = couponService;
    }

    /**
     * Consumes a user coupon.
     */
    @PostMapping("/use")
    public RpcResult<?> use(@RequestBody UseCouponRequest req) {
        return couponService.useCoupon(req);
    }
}
