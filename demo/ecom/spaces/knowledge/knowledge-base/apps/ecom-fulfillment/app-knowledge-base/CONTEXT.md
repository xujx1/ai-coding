# Fulfillment Service 应用知识库

> 模板来源：`prompts/template/app-knowledge-templates/app-kb-template.md`，按 dev-workflow app-knowledge lite 模式填充。

- 应用：ecom-fulfillment
- App ID: ecom-fulfillment
- 领域：履约域
- 仓库：ecom-fulfillment
- 代码版本：3238c43ec3cb810c50cb8a913fdc7e94c4568183
- GitNexus：indexed，181 nodes / 420 edges / 20 flows
- GitNexus: indexed (181 nodes, 420 edges, 20 flows)

## 一句话定位

履约域服务，围绕fulfillment order、package、shipment plan提供fulfillment order、order split、warehouse sourcing能力。Creates fulfillment orders, splits packages, sources warehouses, dispatches WMS tasks, and syncs delivery status.

## 技术栈

| 维度 | 内容 |
|------|------|
| 语言/框架 | Java / Spring Boot 风格 HTTP 服务 |
| RPC | Dubbo 接口与实现 |
| HTTP | 14 个路由，端口 4216 |
| ORM/存储 | MySQL，核心表 fulfillment_orders |
| 图谱 | 全局 GitNexus：global/gitnexus-graph；索引：global/gitnexus-indexes/ecom-fulfillment |

## 知识库导航

| 文档 | 核心内容 | 适用场景 |
|------|---------|---------|
| [01_业务与领域知识层](./01_业务与领域知识层.md) | 服务定位、业务场景、规则、实体、术语 | PRD、需求澄清、业务验收 |
| [02_架构与设计层](./02_架构与设计层.md) | 分层、接口、数据访问、依赖、代码生成约束 | 技术方案、影响分析 |
| [03_核心流程与逻辑层](./03_核心流程与逻辑层.md) | 核心流程、入口、状态、测试触点 | 测试用例、联调排障 |
| [04_工程与规范层](./04_工程与规范层.md) | 编码规范、异常体系、配置、质量约束 | 代码生成、评审、质量门禁 |
| [05_数据库设计层](./05_数据库设计层.md) | 表语义、字段约束、造数和清理策略 | 测试数据准备 |
| [06_演进与决策记录层](./06_演进与决策记录层.md) | ADR、技术债务、风险和演进建议 | 技术方案、架构决策 |
| [api-index.md](./api-index.md) | HTTP/Dubbo/API 入口清单 | 接口测试、E2E 编排 |
| [db-schema.md](./db-schema.md) | 表和造数语义 | 测试数据准备与清理 |
| [component-index.md](./component-index.md) | 组件、类、职责索引 | 代码生成和落点定位 |

## 高频接口（静态候选）

| 排名 | 接口 | 用途 | 测试价值 |
|-----|------|------|---------|
| 01 | `/health` | 服务健康检查 | 冒烟测试 |
| 02 | `/knowledge` | 返回领域知识和依赖事实 | 知识库/影响面验证 |
| 03 | `/sample` | 返回样例业务对象 | 结果断言 |
| 04 | `/validate-requirement` | 校验需求是否命中本领域能力或依赖 | 知识库/影响面验证 |
| 05 | `/fulfillments` | 履约域业务接口 | 按场景确认 |
| 06 | `/fulfillments/:id/split` | 履约域业务接口 | 按场景确认 |
| 07 | `/shipments/:id/status` | 查询履约域业务对象状态 | 结果断言 |
| 08 | `/business/create-fulfillment` | 创建或提交履约域业务对象 | 集成/E2E 种子步骤 |
| 09 | `/business/list` | 查询履约域业务对象状态 | 结果断言 |
| 10 | `/business/get` | 查询履约域业务对象状态 | 结果断言 |

## 关键业务规则

1. fulfillment order必须具备唯一标识，重复提交时应按业务幂等处理，不能产生重复主数据。
2. 履约域写入或状态变更前必须校验上游依赖数据是否存在且处于可用状态。
3. 状态变更必须可追踪，失败时保留足够错误信息，支持测试流程定位失败原因。
4. 对下游消费者暴露的数据必须保持字段语义稳定，删除/取消/失效类操作需要同步评估下游影响。
5. 涉及 fulfillment_orders 的测试数据必须支持按测试标识清理。
6. 创建/发布/提交类接口必须返回可用于后续查询或清理的业务标识。

## 外部依赖

| 方向 | 依赖 | 业务含义 |
|------|------|---------|
| 上游依赖 | trade、inventory、user | 生成测试数据时需先准备这些领域的前置状态 |
| 下游消费者 | logistics、aftersales | 变更本应用时需要评估这些领域的回归范围 |

## 核心实体

- fulfillment order: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- package: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- shipment plan: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- wms task: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- 履约: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- 拆单: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- 寻源: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- 发货: 履约域中的核心业务对象，参与fulfillment order、order split能力。
- 签收: 履约域中的核心业务对象，参与fulfillment order、order split能力。

## 代码规范索引

- 新增业务能力时优先补齐 `01/02/03` 三层知识，再进入技术方案和测试设计。
- 技术方案必须从 `global/gitnexus-graph/impact-map.json` 判断跨应用影响面。
- 测试造数必须从 `global/gitnexus-graph/test-data-map.json` 读取上游 fixture、种子接口和校验接口。
