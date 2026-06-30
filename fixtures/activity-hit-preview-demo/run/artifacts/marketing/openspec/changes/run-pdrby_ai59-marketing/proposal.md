# marketing OpenSpec Change

## Why
MRD Clarification 背景与目标：为营销管理台补充活动命中预览，支持运营用单商品或单 SKU、区域等条件做发布前检查、上线后校验、未命中排查和配置对比，降低误配与同步异常带来的风险。 范围摘要：本期包含管理台预览入口、单次预览、命中结果展示、未命中提示、管理配置侧与用户运行侧区分；不包含活动生命周期管理、订单价格计算、多活动叠加/互斥与最优优惠、批量预览、复杂权限和自动修复。 Feature Inventory | 功能名 | 业务域 | 来源摘要 | 验收摘要 | | | | | | | 营销管理台预览入口 | 运营工具/营销管理 | MRD 要求在营销管理台提供活动命中预览入口，面向运营单次发起检查 | 运营可以在营销管理台进入预览能力并发起单商品或单 SKU 查询 | | 预览条件输入与校验 | 查询条件/输入治理 | MRD 要求支持区域、活动范围类型、商品 ID、SKU ID、操作人；SKU 为空按商品维度，非空优先 SKU | 非法或缺失必要输入可被拦截，SKU 维度优先级符合规则 | | 管理配置侧命中预览 | 配置校验 | MRD 要输出管理配置侧结果，用于检查活动配置、商品绑定和区域范围是否正确 | 运营可看到管理配置侧命中或未命中结果，用于发布前检查 | | 用户运行侧命中预览 | 运行态校验 | MRD 要输出用户运行侧结果，用于确认上线后用户侧是否已经生效 | 运营可看到用户运行侧命中或未命中结果，用于上线后校验 | | 命中活动列表与核心字段展示 | 结果展示 | MRD 要展示活动 ID、名称或可识别字段、状态、玩法类型、优惠门槛、优惠值、区域、商品或 SKU 命中条件 | 命中时可查看活动 ID、状态、玩法类型和优惠核心信息 | | 未命中空状态与排查提示 | 可解释性/排障 | MRD 要把未命中视为正常业务结果，并提示商品未绑...

## Source Mapping
- Primary proposal source: `artifacts/mrd-clarified.md`
- Requirement ownership source: `artifacts/requirement-ownership.json`
- Legacy `artifacts/prd.md`: optional compatibility context only when present.

## Confirmed Requirement Ownership
{ "schemaVersion": 1, "generatedAt": "20260630T04:37:24.100Z", "sourceArtifacts": [ "artifacts/mrdclarified.md", "artifacts/mrdclarifyquestions.md", "artifacts/projectmanifest.json" ], "featureInventory": [ { "featureId": "feature1", "title": "功能名 业务域 来源摘要 验收摘要 营销管理台预览入口 运营工具/营销管理 MRD 要求在营销管理台提供活动命中预览入口，面向运", "summary": "功能名 业务域 来源摘要 验收摘要 营销管理台预览入口 运营工具/营销管理 MRD 要求在营销管理台提供活动命中预览入口，面向运营单次发起检查 运营可以在营销管理台进入预览能力并发起单商品或单 SKU 查询 预览条件输入与校验 查询条件/输入治理 MRD 要求支持区域、活动范围类型、商品 ID、SKU ID、操作人；SKU 为空按商品维度，非空优先 SKU 非法或缺失必要输入可被拦截，SKU 维度优先级符合规则 管理配置侧命中预览 配置校验 MRD 要输出管理配置侧结果，用于检查活动配置、商品绑定和区域范围是否正确 运营可看到管理配置侧命中或未命中结果，用于发布前检查 用户运行侧命中预览 运行态校验 MRD 要输出用户运行侧结果，用于确认上线后用户侧是否已经生效 运营可看到用户运行侧命中或未命中结果，用于上线后校验 命中活动列表与核心字段展示 结果展示 MRD 要展示活动 ID、名称或可识别字段、状态、玩法类型、优惠门槛、优惠值、区域、商品或 SKU 命中条件 命中时可查看活动 ID、状态、玩法类型和优惠核心信息 未命中空状态与排查提示 可...

## What Changes
- 生产代码按开发任务清单实现。
- 测试代码按测试任务清单补充。
- Java 实现和测试生成阶段会同步更新本 change 的 tasks.md 完成状态。

## Impact
- Project: marketing
- Root: /Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing
- Development task count: 23
- Test task count: 23