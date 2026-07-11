# Merchant Shop Service Component Index

> 标准用途：代码生成落点、测试替身定位、影响分析证据。来源为源码类名/函数名和文件路径静态扫描。

- 应用：ecom-merchant
- 源码文件数：19
- 组件候选数：14

## 组件类型汇总

| 类型 | 数量 | 代码生成用途 |
|------|------|-------------|
| API | 1 | 新增 HTTP/页面入口时参考 |
| Dubbo | 3 | 新增 RPC 接口和实现时参考 |
| Service | 3 | 业务编排和领域服务落点 |
| Repository | 3 | 持久化抽象和测试替身落点 |
| Domain | 3 | 实体、DTO、上下文对象扩展落点 |
| Support | 1 | 解析、序列化、配置、工具能力复用 |

## API

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `AppServer` | 店铺商家域对外入口或服务启动入口 | `src/main/java/com/ecommerce/merchant/AppServer.java` |

## Dubbo

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `DubboSupport` | 店铺商家域RPC 接口或实现 | `src/main/java/com/ecommerce/merchant/DubboSupport.java` |
| `MerchantDubboService` | 店铺商家域RPC 接口或实现 | `src/main/java/com/ecommerce/merchant/api/MerchantDubboService.java` |
| `MerchantDubboServiceImpl` | 店铺商家域RPC 接口或实现 | `src/main/java/com/ecommerce/merchant/dubbo/MerchantDubboServiceImpl.java` |

## Service

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `BusinessService` | 店铺商家域业务编排、规则校验或能力实现 | `src/main/java/com/ecommerce/merchant/BusinessService.java` |
| `DomainService` | 店铺商家域业务编排、规则校验或能力实现 | `src/main/java/com/ecommerce/merchant/DomainService.java` |
| `BusinessServiceTest` | 店铺商家域业务编排、规则校验或能力实现 | `src/test/java/com/ecommerce/merchant/BusinessServiceTest.java` |

## Repository

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `BusinessRepository` | 店铺商家域数据读写或持久化适配 | `src/main/java/com/ecommerce/merchant/BusinessRepository.java` |
| `InMemoryBusinessRepository` | 店铺商家域数据读写或持久化适配 | `src/main/java/com/ecommerce/merchant/InMemoryBusinessRepository.java` |
| `JdbcBusinessRepository` | 店铺商家域数据读写或持久化适配 | `src/main/java/com/ecommerce/merchant/JdbcBusinessRepository.java` |

## Domain

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `BusinessRecord` | 店铺商家域领域对象、上下文或数据结构 | `src/main/java/com/ecommerce/merchant/BusinessRecord.java` |
| `DomainContext` | 店铺商家域领域对象、上下文或数据结构 | `src/main/java/com/ecommerce/merchant/DomainContext.java` |
| `RequestParser` | 店铺商家域领域对象、上下文或数据结构 | `src/main/java/com/ecommerce/merchant/RequestParser.java` |

## Support

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `JsonSupport` | 店铺商家域基础支撑能力 | `src/main/java/com/ecommerce/merchant/JsonSupport.java` |

## 代码生成约束

- 新增业务服务时优先复用现有 Service/Repository/Dubbo 命名和包结构。
- 新增测试时优先围绕 Service、Repository、Dubbo/HTTP 入口建立覆盖。
- 删除或迁移组件时必须同步检查 `global/gitnexus-graph/edges.json` 的跨应用影响。
