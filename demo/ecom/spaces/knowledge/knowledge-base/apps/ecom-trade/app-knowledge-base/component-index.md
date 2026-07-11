# Trade Service Component Index

> 标准用途：代码生成落点、测试替身定位、影响分析证据。来源为源码类名/函数名和文件路径静态扫描。

- 应用：ecom-trade
- 源码文件数：22
- 组件候选数：18

## 组件类型汇总

| 类型 | 数量 | 代码生成用途 |
|------|------|-------------|
| API | 1 | 新增 HTTP/页面入口时参考 |
| Dubbo | 3 | 新增 RPC 接口和实现时参考 |
| Service | 5 | 业务编排和领域服务落点 |
| Repository | 3 | 持久化抽象和测试替身落点 |
| Domain | 5 | 实体、DTO、上下文对象扩展落点 |
| Support | 1 | 解析、序列化、配置、工具能力复用 |

## API

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `AppServer` | 交易域对外入口或服务启动入口 | `src/main/java/com/ecommerce/trade/AppServer.java` |

## Dubbo

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `DubboSupport` | 交易域RPC 接口或实现 | `src/main/java/com/ecommerce/trade/DubboSupport.java` |
| `TradeDubboService` | 交易域RPC 接口或实现 | `src/main/java/com/ecommerce/trade/api/TradeDubboService.java` |
| `TradeDubboServiceImpl` | 交易域RPC 接口或实现 | `src/main/java/com/ecommerce/trade/dubbo/TradeDubboServiceImpl.java` |

## Service

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `BusinessService` | 交易域业务编排、规则校验或能力实现 | `src/main/java/com/ecommerce/trade/BusinessService.java` |
| `DomainService` | 交易域业务编排、规则校验或能力实现 | `src/main/java/com/ecommerce/trade/DomainService.java` |
| `TradeOrchestrationService` | 交易域业务编排、规则校验或能力实现 | `src/main/java/com/ecommerce/trade/TradeOrchestrationService.java` |
| `BusinessServiceTest` | 交易域业务编排、规则校验或能力实现 | `src/test/java/com/ecommerce/trade/BusinessServiceTest.java` |
| `TradeOrchestrationServiceTest` | 交易域业务编排、规则校验或能力实现 | `src/test/java/com/ecommerce/trade/TradeOrchestrationServiceTest.java` |

## Repository

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `BusinessRepository` | 交易域数据读写或持久化适配 | `src/main/java/com/ecommerce/trade/BusinessRepository.java` |
| `InMemoryBusinessRepository` | 交易域数据读写或持久化适配 | `src/main/java/com/ecommerce/trade/InMemoryBusinessRepository.java` |
| `JdbcBusinessRepository` | 交易域数据读写或持久化适配 | `src/main/java/com/ecommerce/trade/JdbcBusinessRepository.java` |

## Domain

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `BusinessRecord` | 交易域领域对象、上下文或数据结构 | `src/main/java/com/ecommerce/trade/BusinessRecord.java` |
| `DomainContext` | 交易域领域对象、上下文或数据结构 | `src/main/java/com/ecommerce/trade/DomainContext.java` |
| `RemoteDomainClient` | 交易域领域对象、上下文或数据结构 | `src/main/java/com/ecommerce/trade/RemoteDomainClient.java` |
| `RequestParser` | 交易域领域对象、上下文或数据结构 | `src/main/java/com/ecommerce/trade/RequestParser.java` |
| `FakeRemoteDomainClient` | 交易域领域对象、上下文或数据结构 | 源码符号扫描 |

## Support

| 组件 | 可能职责 | 证据 |
|------|---------|------|
| `JsonSupport` | 交易域基础支撑能力 | `src/main/java/com/ecommerce/trade/JsonSupport.java` |

## 代码生成约束

- 新增业务服务时优先复用现有 Service/Repository/Dubbo 命名和包结构。
- 新增测试时优先围绕 Service、Repository、Dubbo/HTTP 入口建立覆盖。
- 删除或迁移组件时必须同步检查 `global/gitnexus-graph/edges.json` 的跨应用影响。
