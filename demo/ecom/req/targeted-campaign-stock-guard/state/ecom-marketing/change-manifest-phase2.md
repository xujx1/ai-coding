# ecom-marketing Phase 2 变更清单

| 文件 | 变更 |
|------|------|
| `BusinessService.java` | 新增商品/库存 gateway；创建阶段只校验；启用阶段保护；删除阶段幂等释放 |
| `JdbcBusinessRepository.java` | 增加 `protected_stock` 持久化字段 |
| `BusinessServiceTest.java` | 覆盖创建不保护、不可售失败、库存不足、启用保护、重复删除 |
