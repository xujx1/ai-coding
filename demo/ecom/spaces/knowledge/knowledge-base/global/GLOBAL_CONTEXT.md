# ecom Workspace 全局上下文

- 生成时间：2026-07-16T21:10:52
- 知识库根：`spaces/knowledge/knowledge-base`
- 当前领域：`ecom`
- 应用数量：14
- 核心流程：商品上架, 营销活动库存保护, 下单支付履约, 退款售后, 结算对账

## 使用入口

- 领域上下文：`domains/ecom/CONTEXT.md`
- 应用注册：`registry/apps.json`
- 依赖地图：`global/dependency-map.json`
- API 路由：`global/api-route-map.json`
- 术语汇总：`global/business-glossary.md`

## 摘要

ecom demo 使用 14 个 Java/Maven 应用模拟电商领域。每个业务应用暴露轻量 HTTP `/business/*` 入口和 Dubbo provider；`ecom-trade` 通过 `RemoteDomainClient` 编排商品、用户、营销、库存、支付、履约、物流、商家、内容、结算、供应链、售后和客服流程。
