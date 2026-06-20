package com.ump.marketing.web.controller;

import com.ump.marketing.api.dto.*;
import com.ump.marketing.api.result.RpcResult;
import com.ump.marketing.application.service.ProductService;
import com.ump.marketing.domain.model.ActivityScope;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/product")
public class ProductController {

    @Autowired
    private ProductService productService;

    @PostMapping("/bind")
    public RpcResult<ActivityScope> bind(@RequestBody BindProductRequest req) {
        return productService.bindProduct(req);
    }

    @PostMapping("/unbind")
    public RpcResult<Void> unbind(@RequestBody UnbindProductRequest req) {
        return productService.unbindProduct(req);
    }

    @PostMapping("/queryByScope")
    public RpcResult<List<ScopeActivityDTO>> queryByScope(@RequestBody QueryScopeRequest req) {
        return productService.queryActivitiesByScope(req);
    }
}
