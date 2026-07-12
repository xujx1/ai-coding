# 知识库索引

> 模板来源：`prompts/template/app-knowledge-templates/kb-index-template.md`，Agent 启动时先读本文件，再按锚点下钻。

- 应用：ecom-customer-service
- 领域：客服域
- 保鲜周期：1个月
- 影响面入口：global/gitnexus-graph/impact-map.json
- 造数入口：global/gitnexus-graph/test-data-map.json

## 核心实体

| 实体 | 业务含义 | 详情锚点 |
|------|---------|---------|
| ticket | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| conversation | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| work order | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| service sla | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 客服 | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 咨询 | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 工单 | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 纠纷 | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 智能客服 | 客服域中的核心业务对象，参与consultation、work order能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |

## 核心流程

| 流程 | 触发入口 | 详情锚点 |
|------|---------|---------|
| 客服域 - 客服 | /business/create-ticket | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |
| 客服域 - 咨询 | /tickets | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |
| 客服域 - 工单 | /conversations | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |
| 客服域 - 纠纷 | /bot/intents | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |

## 关键接口

| 服务 | 接口数 | 详情锚点 |
|------|--------|---------|
| Customer Service | 13 | [api-index.md](./api-index.md) |

## 组件清单

| 类型 | 数量 | 详情锚点 |
|------|------|---------|
| API | 1 | [component-index.md#api](./component-index.md#api) |
| Dubbo | 3 | [component-index.md#dubbo](./component-index.md#dubbo) |
| Service | 3 | [component-index.md#service](./component-index.md#service) |
| Repository | 3 | [component-index.md#repository](./component-index.md#repository) |
| Domain | 3 | [component-index.md#domain](./component-index.md#domain) |
| Support | 1 | [component-index.md#support](./component-index.md#support) |

## 数据库表

| 表名 | 业务用途 | 详情锚点 |
|------|---------|---------|
| customer_service_tickets | ticket相关业务数据表，支撑consultation、work order场景 | [db-schema.md](./db-schema.md) |

## 下钻顺序

1. 需求/PRD：先读 `CONTEXT.md` 与 `01_业务与领域知识层.md`。
2. 技术方案：再读 `02_架构与设计层.md`、`component-index.md` 和全局 `impact-map.json`。
3. 代码生成：读 `04_工程与规范层.md`，确认分层、异常、配置和质量约束。
4. 测试用例：读 `03_核心流程与逻辑层.md`、`api-index.md`、`05_数据库设计层.md`、`db-schema.md` 和全局 `test-data-map.json`。
5. 架构评审：读 `06_演进与决策记录层.md`，确认 ADR、风险和演进约束。
