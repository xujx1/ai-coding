# ecom-inventory Phase 2 变更清单

| 文件 | 变更 |
|------|------|
| `BusinessRepository.java` | 增加 SKU 查询和活动保护记录访问契约 |
| `InMemoryBusinessRepository.java` | 增加内存活动保护记录存储 |
| `JdbcBusinessRepository.java` | 新增 `inventory_campaign_protections` 表和读写方法 |
| `BusinessService.java` | 新增可保护库存查询、活动保护、幂等释放 |
| `AppServer.java` | 新增库存保护 HTTP 路由 |
| `BusinessServiceTest.java` | 覆盖可保护库存、重复保护、重复释放、库存不足 |
