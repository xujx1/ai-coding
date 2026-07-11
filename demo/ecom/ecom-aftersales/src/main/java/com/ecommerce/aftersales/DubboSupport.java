package com.ecommerce.aftersales;

import com.ecommerce.aftersales.api.AftersalesDubboService;
import com.ecommerce.aftersales.dubbo.AftersalesDubboServiceImpl;
import org.apache.dubbo.config.ApplicationConfig;
import org.apache.dubbo.config.ProtocolConfig;
import org.apache.dubbo.config.ServiceConfig;
import org.apache.dubbo.config.bootstrap.DubboBootstrap;

public final class DubboSupport {
    private DubboSupport() {
    }

    public static void startProvider(BusinessService businessService) {
        int port = Integer.parseInt(System.getenv().getOrDefault("DUBBO_PORT", "4313"));
        ServiceConfig<AftersalesDubboService> service = new ServiceConfig<>();
        service.setInterface(AftersalesDubboService.class);
        service.setRef(new AftersalesDubboServiceImpl(businessService));

        DubboBootstrap.getInstance()
                .application(new ApplicationConfig(DomainContext.DOMAIN + "-provider"))
                .protocol(new ProtocolConfig("dubbo", port))
                .service(service)
                .start();
        System.out.printf("%s Dubbo provider exported on dubbo://127.0.0.1:%d/%s%n",
                DomainContext.SERVICE_NAME, port, AftersalesDubboService.class.getName());
    }
}
