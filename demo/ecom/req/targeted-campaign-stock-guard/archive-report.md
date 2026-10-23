# 定向营销活动库存保护归档报告

> 归档时间：2026-07-16T22:33:59  
> feature_dir：`req/targeted-campaign-stock-guard`  
> domain：`ecom`  
> ai_commit_hash：`1a9f2ce299064b6cd047eef7b4310b0edfc28bd4`  
> archive_code_ref：`1a9f2ce299064b6cd047eef7b4310b0edfc28bd4`  
> post_ai_commits：false
> openspec_archive_path：`openspec/changes/archive/2026-07-16-targeted-campaign-stock-guard`

## 一、归档结论

本次归档完成领域知识库更新、归档报告生成和 learnings 写入。功能实现以当前 `HEAD` 为准：活动创建阶段只校验商品和可保护库存，不创建库存保护记录；活动启用阶段创建 `inventory_campaign_protections` 保护记录；活动删除阶段幂等释放保护记录。

## 二、受影响应用

| 应用 | 角色 | 归档结论 | 证据 |
|------|------|----------|------|
| `ecom-console` | primary | 新增 `stockGuardCampaign` 控制台入口，串联商品、库存和营销接口 | `/Users/xu/IdeaProjects/ecom/console/index.html`、`app.js` |
| `ecom-marketing` | primary | 扩展活动创建、启用、删除编排；创建只校验，启用保护，删除释放 | `BusinessService`、`JdbcBusinessRepository`、单测 PASS |
| `ecom-inventory` | secondary | 新增活动库存保护表、可保护库存查询、保护和释放接口 | `BusinessService`、`JdbcBusinessRepository`、单测 PASS |
| `ecom-product` | secondary | `/business/get` 兼容 `skuId` 查询，返回活动校验所需摘要 | `AppServer`、单测 PASS |
| `ecom-trade` | verification | 未改生产代码，仅作为交易链路回归验证应用 | impact-check、单测 PASS |

## 三、跨应用契约变更

| 提供方 | 消费方 | 契约 | 变化 |
|--------|--------|------|------|
| `ecom-product` | `ecom-marketing`, `ecom-console` | `POST /business/get` | 请求兼容 `skuId`；返回 `status`、`saleable`、`priceCent` |
| `ecom-inventory` | `ecom-marketing`, `ecom-console` | `POST /business/query-available` | 返回 `availableQuantity`、`campaignProtectedQuantity`、`protectableQuantity` |
| `ecom-inventory` | `ecom-marketing` | `POST /business/protect-campaign-stock` | 按 `campaignId + skuId` 创建或幂等返回库存保护 |
| `ecom-inventory` | `ecom-marketing` | `POST /business/release-campaign-stock` | 缺记录、已释放、重复释放均返回成功 |
| `ecom-marketing` | `ecom-console` | `POST /business/create-campaign` | 支持 `protectedStock`；创建阶段只校验不保护 |
| `ecom-marketing` | `ecom-console` | `POST /business/enable-campaign` | 启用阶段创建库存保护 |
| `ecom-marketing` | `ecom-console` | `POST /business/delete-campaign` | 删除阶段释放库存保护，重复删除幂等成功 |

## 四、CodeGraph 刷新状态

| 应用 | 状态 | 索引路径 | 说明 |
|------|------|----------|------|
| `ecom-product` | indexed | `ecom-product/.codegraph` | 归档采用本地索引与静态代码证据 |
| `ecom-inventory` | indexed | `ecom-inventory/.codegraph` | 已登记新增库存保护表与接口 |
| `ecom-marketing` | indexed | `ecom-marketing/.codegraph` | 已登记商品/库存 HTTP gateway 编排 |
| `ecom-trade` | indexed | `ecom-trade/.codegraph` | verification-only，无生产代码变更 |
| `ecom-console` | failed | `/Users/xu/IdeaProjects/ecom/console/.codegraph` | `unable to open database file`，归档降级为静态文件阅读 |

## 五、领域知识库变化

| 文件 | 变化 |
|------|------|
| `flows.md` | 更新 `campaign-stock-guard`：创建只校验、启用保护、删除幂等释放 |
| `entrypoints.md` | 新增控制台 UI 入口和库存保护 HTTP 路由 |
| `dependency-graph.md` | 新增 `ecom-console` 与 `ecom-marketing` 到商品/库存/营销的 HTTP 依赖 |
| `interfaces.md` | 新增库存保护数据契约，补充 `protected_stock` |
| `data-map.md` | 新增 `inventory_campaign_protections` 表与 `marketing_campaigns.protected_stock` |
| `registry.json` | 登记 `ecom-console`、库存保护接口和库存保护表 |
| `codegraph-indexes.json` | 记录 `ecom-console` CodeGraph 失败状态 |
| `learnings.jsonl` | 写入 5 条可复用归档事实 |

## 六、Stage 04 集成测试证据

| 项目 | 状态 | 说明 |
|------|------|------|
| 集成用例 | scripts_ready | 已生成 `integration-test-cases.md` |
| 数据计划 | scripts_ready | 已生成 `data-plan.md` |
| 环境准备 | skipped | `execute=false`，未读取真实环境配置 |
| 执行报告 | pending | review-only，未实跑集成测试 |
| 阻塞项 | pending | 缺少 `execute=true` 和 `environment_config_path` |

## 七、造数与清理状态

| 类型 | 应用 | 状态 | 路径 |
|------|------|------|------|
| seed SQL | `ecom-product` | 已生成，未执行 | `integration-test/seed-sql/ecom-product.sql` |
| seed SQL | `ecom-inventory` | 已生成，未执行 | `integration-test/seed-sql/ecom-inventory.sql` |
| seed SQL | `ecom-marketing` | 不需要直接 SQL seed，活动通过 API 创建 | `integration-test/seed-sql/ecom-marketing.sql` |
| cleanup SQL | `ecom-product` | 已生成，未执行 | `integration-test/cleanup-sql/ecom-product-cleanup.sql` |
| cleanup SQL | `ecom-inventory` | 已生成，未执行 | `integration-test/cleanup-sql/ecom-inventory-cleanup.sql` |
| cleanup SQL | `ecom-marketing` | 已生成，未执行 | `integration-test/cleanup-sql/ecom-marketing-cleanup.sql` |

## 八、影响面验证

| 验证项 | 结果 |
|--------|------|
| `ecom-product` 单测 | PASS，4 tests |
| `ecom-inventory` 单测 | PASS，7 tests |
| `ecom-marketing` 单测 | PASS，9 tests |
| `ecom-trade` 回归单测 | PASS，5 tests |
| `ecom-console` 语法校验 | PASS，`node --check app.js` |
| OpenSpec 校验 | PASS，`openspec validate targeted-campaign-stock-guard --strict` |
| Freshness 脚本 | 未执行；`.workflow/scripts/freshness-check.js` 不存在，使用本地文件和 JSON 解析校验 |

## 九、归档注意事项

- Stage 04 当前是 review-only，不代表真实环境集成测试已通过。
- `ecom-console` CodeGraph 索引失败已记录，不阻塞归档，但后续影响面分析应优先修复该索引。
- OpenSpec 主规格目录当前为空，本次归档不执行 delta spec 同步。
