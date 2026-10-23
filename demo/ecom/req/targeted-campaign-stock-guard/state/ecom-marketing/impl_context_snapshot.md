# ecom-marketing 实现上下文快照

营销服务原来只做本地状态流转。本次用可注入 gateway 编排商品和库存，默认 HTTP 调用本地 demo 服务，单元测试使用 fake gateway 保持 mock-first。
