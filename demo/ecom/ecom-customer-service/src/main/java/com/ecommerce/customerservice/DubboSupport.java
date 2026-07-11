package com.ecommerce.customerservice;

import com.ecommerce.customerservice.api.CustomerServiceDubboService;
import com.ecommerce.customerservice.dubbo.CustomerServiceDubboServiceImpl;
import org.apache.dubbo.config.ApplicationConfig;
import org.apache.dubbo.config.ProtocolConfig;
import org.apache.dubbo.config.ServiceConfig;
import org.apache.dubbo.config.bootstrap.DubboBootstrap;

public final class DubboSupport {
    private DubboSupport() {
    }

    public static void startProvider(BusinessService businessService) {
        int port = Integer.parseInt(System.getenv().getOrDefault("DUBBO_PORT", "4321"));
        ServiceConfig<CustomerServiceDubboService> service = new ServiceConfig<>();
        service.setInterface(CustomerServiceDubboService.class);
        service.setRef(new CustomerServiceDubboServiceImpl(businessService));

        DubboBootstrap.getInstance()
                .application(new ApplicationConfig(DomainContext.DOMAIN + "-provider"))
                .protocol(new ProtocolConfig("dubbo", port))
                .service(service)
                .start();
        System.out.printf("%s Dubbo provider exported on dubbo://127.0.0.1:%d/%s%n",
                DomainContext.SERVICE_NAME, port, CustomerServiceDubboService.class.getName());
    }
}
