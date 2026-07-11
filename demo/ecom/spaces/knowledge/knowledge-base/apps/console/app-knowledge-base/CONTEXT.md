# console 应用知识库

> 模板来源：`src/knowledge/app-knowledge-agent/templates/app-kb-template.md`，按 dev-workflow app-knowledge lite 模式填充。

- 应用：console
- App ID: console
- 领域：console
- 仓库：console
- 代码版本：3002e6de736a08a4cfe0389c906e7abad1a369d6
- GitNexus：indexed，11 nodes / 15 edges / 0 flows
- GitNexus: indexed (11 nodes, 15 edges, 0 flows)

## 一句话定位

console服务，围绕console提供核心业务能力。

## 技术栈

| 维度 | 内容 |
|------|------|
| 语言/框架 | Node.js / Hono / Web UI |
| RPC | 未发现 Dubbo 接口 |
| HTTP | 9 个路由，端口 待确认 |
| ORM/存储 | 未发现自有表，可能只做编排或内存态示例 |
| 图谱 | 全局 GitNexus：global/gitnexus-graph；索引：global/gitnexus-indexes/console |

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
| 02 | `/business/create-sku` | 创建或提交console业务对象 | 集成/E2E 种子步骤 |
| 03 | `/business/enable-sale` | 发布、生效或上架console业务对象 | 按场景确认 |
| 04 | `/business/create-campaign` | 创建或提交console业务对象 | 集成/E2E 种子步骤 |
| 05 | `/business/enable-campaign` | 发布、生效或上架console业务对象 | 按场景确认 |
| 06 | `/business/delete-campaign` | 删除、取消或失效console业务对象 | 集成/E2E 种子步骤 |
| 07 | `/business/demo-checkout` | console业务接口 | 按场景确认 |
| 08 | `/business/demo-cancel` | 删除、取消或失效console业务对象 | 集成/E2E 种子步骤 |
| 09 | `/business/demo-full-chain` | console业务接口 | 按场景确认 |

## 关键业务规则

1. console必须具备唯一标识，重复提交时应按业务幂等处理，不能产生重复主数据。
2. console写入或状态变更前必须校验上游依赖数据是否存在且处于可用状态。
3. 状态变更必须可追踪，失败时保留足够错误信息，支持测试流程定位失败原因。
4. 对下游消费者暴露的数据必须保持字段语义稳定，删除/取消/失效类操作需要同步评估下游影响。
5. 当前未发现自有表，测试数据主要依赖接口返回和上游 fixture。
6. 创建/发布/提交类接口必须返回可用于后续查询或清理的业务标识。

## 外部依赖

| 方向 | 依赖 | 业务含义 |
|------|------|---------|
| 上游依赖 | 无显式上游 | 生成测试数据时需先准备这些领域的前置状态 |
| 下游消费者 | 无显式下游 | 变更本应用时需要评估这些领域的回归范围 |

## 核心实体

- 待确认：代码和领域配置未声明核心实体。

## 代码规范索引

- 新增业务能力时优先补齐 `01/02/03` 三层知识，再进入技术方案和测试设计。
- 技术方案必须从 `global/gitnexus-graph/impact-map.json` 判断跨应用影响面。
- 测试造数必须从 `global/gitnexus-graph/test-data-map.json` 读取上游 fixture、种子接口和校验接口。
