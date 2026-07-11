package com.ecommerce.payment;

import com.ecommerce.payment.api.PaymentDubboService;
import com.ecommerce.payment.dubbo.PaymentDubboServiceImpl;
import org.apache.dubbo.config.ApplicationConfig;
import org.apache.dubbo.config.ProtocolConfig;
import org.apache.dubbo.config.ServiceConfig;
import org.apache.dubbo.config.bootstrap.DubboBootstrap;

public final class DubboSupport {
    private DubboSupport() {
    }

    public static void startProvider(BusinessService businessService) {
        int port = Integer.parseInt(System.getenv().getOrDefault("DUBBO_PORT", "4312"));
        ServiceConfig<PaymentDubboService> service = new ServiceConfig<>();
        service.setInterface(PaymentDubboService.class);
        service.setRef(new PaymentDubboServiceImpl(businessService));

        DubboBootstrap.getInstance()
                .application(new ApplicationConfig(DomainContext.DOMAIN + "-provider"))
                .protocol(new ProtocolConfig("dubbo", port))
                .service(service)
                .start();
        System.out.printf("%s Dubbo provider exported on dubbo://127.0.0.1:%d/%s%n",
                DomainContext.SERVICE_NAME, port, PaymentDubboService.class.getName());
    }
}
