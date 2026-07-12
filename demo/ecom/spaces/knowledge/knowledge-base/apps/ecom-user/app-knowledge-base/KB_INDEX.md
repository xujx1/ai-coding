# 知识库索引

> 模板来源：`prompts/template/app-knowledge-templates/kb-index-template.md`，Agent 启动时先读本文件，再按锚点下钻。

- 应用：ecom-user
- 领域：用户域
- 保鲜周期：1个月
- 影响面入口：global/gitnexus-graph/impact-map.json
- 造数入口：global/gitnexus-graph/test-data-map.json

## 核心实体

| 实体 | 业务含义 | 详情锚点 |
|------|---------|---------|
| user account | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| member profile | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| address | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| identity record | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 用户 | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 会员 | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 账号 | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 地址 | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 实名 | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 画像 | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |
| 等级 | 用户域中的核心业务对象，参与account、member level能力 | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |

## 核心流程

| 流程 | 触发入口 | 详情锚点 |
|------|---------|---------|
| 用户域 - 用户 | /users/:userId/addresses | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |
| 用户域 - 会员 | /business/create-user | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |
| 用户域 - 账号 | /business/add-address | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |
| 用户域 - 地址 | /users/:userId | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |

## 关键接口

| 服务 | 接口数 | 详情锚点 |
|------|--------|---------|
| User CRM Service | 13 | [api-index.md](./api-index.md) |

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
| user_profiles | user account相关业务数据表，支撑account、member level场景 | [db-schema.md](./db-schema.md) |

## 下钻顺序

1. 需求/PRD：先读 `CONTEXT.md` 与 `01_业务与领域知识层.md`。
2. 技术方案：再读 `02_架构与设计层.md`、`component-index.md` 和全局 `impact-map.json`。
3. 代码生成：读 `04_工程与规范层.md`，确认分层、异常、配置和质量约束。
4. 测试用例：读 `03_核心流程与逻辑层.md`、`api-index.md`、`05_数据库设计层.md`、`db-schema.md` 和全局 `test-data-map.json`。
5. 架构评审：读 `06_演进与决策记录层.md`，确认 ADR、风险和演进约束。
