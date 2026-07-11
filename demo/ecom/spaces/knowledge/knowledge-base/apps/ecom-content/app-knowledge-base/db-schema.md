# Content Service DB Schema

> 标准用途：测试造数、清理策略、数据库影响分析。来源为 `src/main/resources/schema.sql` 静态扫描。

- 应用：ecom-content
- 表数量：1

## 核心表

| 表名 | 业务用途 | 推荐造数方式 | 清理策略 |
|------|---------|-------------|---------|
| `content_items` | post相关业务数据表，支撑post、short video场景 | 通过种子接口优先，其次 SQL 插入最小字段 | 按测试 runId/id 前缀清理，避免污染共享数据 |

## 字段语义约定

| 字段模式 | 业务含义 | 测试注意事项 |
|----------|---------|-------------|
| id / *_id | 业务对象或关联对象唯一标识 | 造数时使用稳定唯一值，便于清理 |
| status | 业务状态 | 必须和流程文档状态保持一致 |
| payload_json / ext_json | 扩展业务属性 | 保留必要字段，不要写空对象绕过校验 |
| created_at / updated_at | 数据生命周期时间 | 时间类断言避免使用精确毫秒 |

## 造数依赖

- 上游 fixture：product、merchant、user
- 种子接口：`/business/create-post`、`/business/bind-product`
- 校验接口：`/health`、`/knowledge`、`/sample`、`/business/list`、`/business/get`
- 全局造数入口：`global/gitnexus-graph/test-data-map.json`。
