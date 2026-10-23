# 定向营销活动库存保护集成测试用例

## 一、范围

本轮覆盖 `campaign-stock-guard` 核心闭环、失败分支、幂等分支、控制台演示和交易回归。

## 二、用例清单

| 编号 | 业务流程 | 涉及 app | 前置数据 | 执行动作 | 预期跨应用结果 | 观测点 | 回滚/清理 | 证据等级 |
|------|----------|----------|----------|----------|----------------|--------|-----------|----------|
| IT-01 | 库存保护活动创建-启用-删除闭环 | `ecom-product`, `ecom-inventory`, `ecom-marketing` | SKU `SKU-GUARD-1` 已上架，库存 100，可保护库存 100 | 商品创建/上架，库存设置，营销创建 `protectedStock=30`，启用，再删除 | 创建返回 `DRAFT` 且只校验不保护；启用返回 `ENABLED`；删除返回 `DELETED` 且释放保护 | 商品状态、库存可保护量、活动状态、保护结果 | 删除活动、删除库存与 SKU | confirmed |
| IT-02 | 创建时 SKU 未上架阻断 | `ecom-product`, `ecom-inventory`, `ecom-marketing` | SKU `SKU-GUARD-OFF` 存在但未上架，库存充足 | 营销创建 `protectedStock=10` | 创建失败，返回不可售原因，不写入保护记录 | 商品查询结果、营销错误响应 | 清理 SKU 和库存 | confirmed |
| IT-03 | 创建时库存不足阻断 | `ecom-product`, `ecom-inventory`, `ecom-marketing` | SKU `SKU-GUARD-LOW` 已上架，可保护库存 5 | 营销创建 `protectedStock=10` | 创建失败，返回库存不足原因，不写入活动 | 库存可保护量、营销错误响应 | 清理 SKU 和库存 | confirmed |
| IT-04 | 重复启用与重复删除幂等 | `ecom-product`, `ecom-inventory`, `ecom-marketing` | `CAMP-GUARD-REPEAT` 草稿活动可正常创建 | 启用两次，再删除两次 | 第二次启用/删除均返回成功，不重复占用或归还库存 | 保护记录状态、幂等标记、可保护量变化 | 删除活动与保护记录 | confirmed |
| IT-05 | 控制台一键演示 | `ecom-console`, `ecom-product`, `ecom-inventory`, `ecom-marketing` | 控制台可访问，后端服务可用 | 点击“创建受库存保护的活动” | 页面展示商品创建、上架、库存设置、活动创建、活动启用结果 | 请求与返回摘要面板 | 删除活动与测试 SKU/库存 | manual |
| IT-06 | 交易链路回归 | `ecom-trade`, `ecom-marketing`, `ecom-inventory` | 核心 guard 活动已处于启用状态 | 触发交易下单和取消演示 | 交易成功，取消释放链路正常，不受营销保护改动影响 | 交易返回、库存/营销无异常 | 清理订单演示数据 | confirmed |

## 三、观测重点

1. 创建阶段只做商品和库存校验，不应出现库存保护记录。
2. 启用阶段才写入活动库存保护记录。
3. 删除和重复删除都必须幂等成功。
4. 交易回归只验证不回退代码。
