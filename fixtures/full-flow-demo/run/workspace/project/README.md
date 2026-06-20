# UMP Marketing Platform v1 - Sprint 1+

UMP营销中台v1：活动管理、商品关联、券引擎、限购占用、B/C同步、Region国际化的一体化营销后端服务。

## 技术栈

| 组件 | 版本 |
|------|------|
| JDK | 1.8 |
| Maven | 3.6+ |
| Spring Boot | 2.7.18 |
| MyBatis | 2.3.1 (mybatis-spring-boot-starter) |
| MySQL | 8.0（生产） |
| H2 | 2.1.214（测试内存库） |
| Caffeine | 2.9.3（本地缓存，生产可替换Redis） |
| JUnit 5 + Mockito | 测试 |
| Kafka / Canal | 接口抽象 + 本地Mock实现 |

## 模块结构（单Maven模块，分层包结构）

```
src/main/java/com/ump/marketing/
├── UmpMarketingApplication.java     # Spring Boot 启动类
├── api/                              # [marketing-api] DTO、枚举、错误码
│   ├── dto/                          # 请求/响应DTO
│   ├── enums/                        # ActivityStatus, CouponStatus, ErrorCode等
│   └── result/                       # RpcResult<T> 统一返回
├── domain/                           # [marketing-domain] 领域模型、状态机、规则
│   ├── model/                        # 领域实体（Activity, CouponInstance等）
│   ├── statemachine/                 # ActivityStateMachine, CouponStateMachine
│   └── service/                      # ScopeKeyGenerator, RuleValidator
├── application/                      # [marketing-application] 应用服务、事务、幂等、审计
│   └── service/                      # ActivityService, CouponService, QuotaService等
├── infrastructure/                   # [marketing-infrastructure] Mapper、消息、缓存、分库分表
│   ├── mapper/                       # MyBatis Mapper接口 + XML
│   ├── messaging/                    # KafkaProducer / MockKafkaProducer / Canal接口
│   ├── cache/                        # LocalCache / CaffeineLocalCache
│   ├── sharding/                     # ShardingRouter（分表路由）、RegionRouter（区域隔离）
│   ├── dlq/                          # DlqService（死信队列、指数退避重试）
│   └── config/                       # MyBatisConfig、IdGenerator、DataInitializer
└── web/                              # [marketing-web] REST Controller
    └── controller/                   # ActivityController等20个接口

src/main/resources/
├── application.yml                   # 生产配置（MySQL）
├── schema.sql                        # H2/通用建表DDL
├── schema-mysql.sql                  # MySQL 8 建表DDL
└── mapper/                           # MyBatis XML Mapper（C端分表动态表名）

src/test/                             # [marketing-test] 单元测试 + 集成测试
├── java/.../domain/                  # 状态机/ScopeKey/RuleValidator单元测试
├── java/.../integration/             # 端到端集成测试（H2 + Mock Kafka）
└── resources/application.yml         # 测试配置（H2内存库 + schema自动初始化）
```

## 快速启动

### 1. 环境要求
- JDK 8
- Maven 3.6+
- MySQL 8（本地可用H2内存库启动，无需安装MySQL）

### 2. 编译打包
```bash
cd ump-marketing
mvn clean package -DskipTests
```

### 3. 本地启动（H2内存库，无需MySQL）
默认`application.yml`配置了MySQL，但Spring Boot会优先使用classpath的H2驱动。
如需纯H2快速体验，可以用test profile启动：
```bash
mvn spring-boot:run -Dspring-boot.run.profiles=test
```
或者直接在IDE中运行`UmpMarketingApplication.main()`，并在VM options或环境变量中设置H2数据源。

### 4. 本地启动（MySQL）
1. 创建数据库：
```sql
CREATE DATABASE ump_marketing DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
2. 执行DDL：
```bash
mysql -u root -p ump_marketing < src/main/resources/schema-mysql.sql
```
3. 修改`src/main/resources/application.yml`中的数据库连接配置：
```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/ump_marketing?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false
    username: root
    password: your_password
```
4. 启动：
```bash
mvn spring-boot:run
```
服务启动后监听 `http://localhost:8080`，默认会自动插入CN Region和3个默认工具（满减/折扣/优惠券）。

## 数据库表说明

### B端管理表（9张单库表 + 1张DLQ表）

| 表名 | 说明 | 乐观锁 | 软删除 | 审计 |
|------|------|--------|--------|------|
| t_activity | 活动主表 | version | is_deleted | created_by/updated_by |
| t_activity_tool | 玩法工具模板 | version | is_deleted | created_by/updated_by |
| t_activity_scope | 商品/SKU活动绑定 | version | is_deleted | created_by/updated_by |
| t_coupon_template | 券模板 | version | is_deleted | created_by/updated_by |
| t_coupon_batch | 券发放批次 | version | is_deleted | created_by/updated_by |
| t_region_cell | Region Cell配置 | version | is_deleted | created_by/updated_by |
| t_sync_event_log | B/C同步事件消费日志 | - | - | - |
| t_operation_audit_log | 操作审计日志 | - | - | - |
| t_idempotency_record | 幂等记录（7天TTL） | - | - | - |
| t_dlq_message | 死信队列消息 | - | - | - |

### C端运行时分表（112张物理表）

| 逻辑表 | 物理表 | 分表数 | 分表键 |
|--------|--------|--------|--------|
| t_scope_act | t_scope_act_00 ~ t_scope_act_15 | 16 | scope_key |
| t_coupon_inst | t_coupon_inst_00 ~ t_coupon_inst_63 | 64 | user_id |
| t_order_occur | t_order_occur_00 ~ t_order_occur_31 | 32 | order_id |

分表路由算法：
```
table_index = positive(hash(region_code + ":" + shard_key)) % table_count
```
（hash使用Java String.hashCode，取Math.abs并防护Integer.MIN_VALUE）

## 已实现的20个RPC接口

所有接口统一返回 `RpcResult<T>`：
```json
{"code": 0, "message": "SUCCESS", "requestId": "req-xxx", "data": {...}}
```

### Activity BC（8个接口）

| # | 接口 | 方法 | URL | 状态转换 |
|---|------|------|-----|----------|
| 1 | 创建活动 | createActivity | POST /api/activity/create | -> DRAFT |
| 2 | 编辑活动 | updateActivity | POST /api/activity/update | DRAFT/REJECTED可编辑 |
| 3 | 提交审批 | submitForApproval | POST /api/activity/submitApproval | DRAFT->PENDING_APPROVAL |
| 4 | 审批通过 | approveActivity | POST /api/activity/approve | PENDING_APPROVAL->APPROVED |
| 5 | 审批驳回 | rejectActivity | POST /api/activity/reject | PENDING_APPROVAL->REJECTED |
| 6 | 上线活动 | onlineActivity | POST /api/activity/online | APPROVED->ONLINE |
| 7 | 暂停/恢复 | pauseActivity | POST /api/activity/pause | ONLINE<->PAUSED |
| 8 | 强制下线 | forceOfflineActivity | POST /api/activity/forceOffline | 任意非终态->TERMINATED |

### Product BC（3个接口）

| # | 接口 | 方法 | URL |
|---|------|------|-----|
| 9 | 绑定商品 | bindProduct | POST /api/product/bind |
| 10 | 解绑商品 | unbindProduct | POST /api/product/unbind |
| 11 | 按scope查询活动 | queryActivitiesByScope | POST /api/product/queryByScope |

### Coupon BC（5个接口）

| # | 接口 | 方法 | URL |
|---|------|------|-----|
| 12 | 创建券模板 | createCouponTemplate | POST /api/coupon/createTemplate |
| 13 | 发券（定向） | issueCoupon | POST /api/coupon/issue |
| 14 | 用户领券 | receiveCoupon | POST /api/coupon/receive |
| 15 | 核销券 | useCoupon | POST /api/coupon/use |
| 16 | 查询券 | queryCoupon | POST /api/coupon/query |

### Quota BC（3个接口）

| # | 接口 | 方法 | URL |
|---|------|------|-----|
| 17 | 下单占用 | occupyQuota | POST /api/quota/occupy |
| 18 | 取消释放 | releaseQuota | POST /api/quota/release |
| 19 | 支付确认 | confirmQuota | POST /api/quota/confirm |

### Sync BC（1个接口）

| # | 接口 | 方法 | URL |
|---|------|------|-----|
| 20 | 发布同步事件 | publishSyncEvent | POST /api/sync/publishEvent |

### 运维接口
- POST /api/sync/retryDlq - 触发DLQ重试扫描
- POST /api/sync/manualReplay?eventId=xxx - 手动重放指定DLQ事件

## 接口调用示例

### 创建活动
```bash
curl -X POST http://localhost:8080/api/activity/create \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "req-001",
    "caller": "admin-console",
    "operator": "operator-zhang",
    "regionCode": "CN",
    "idempotencyKey": "admin-console:CREATE_ACTIVITY:biz-001",
    "timestampMs": 1718700000000,
    "activityName": "618满100减20",
    "toolId": "tool-full-reduce",
    "toolType": "FULL_REDUCE",
    "tenantId": "tenant-001",
    "thresholdAmount": 100.00,
    "discountAmount": 20.00,
    "startTime": 1718800000000,
    "endTime": 1719800000000,
    "scopeType": "ALL",
    "isPurchaseLimited": false,
    "purchaseLimitPerUser": 1
  }'
```

### 提交审批 -> 审批通过 -> 上线
```bash
# 提交审批
curl -X POST http://localhost:8080/api/activity/submitApproval \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-002","caller":"admin-console","operator":"operator-zhang","regionCode":"CN","idempotencyKey":"idem-submit-001","activityId":"<从上一步返回的activityId>"}'

# 审批通过
curl -X POST http://localhost:8080/api/activity/approve \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-003","caller":"admin-console","operator":"approver-li","regionCode":"CN","idempotencyKey":"idem-approve-001","activityId":"<activityId>","approverId":"approver-li","comment":"同意"}'

# 上线
curl -X POST http://localhost:8080/api/activity/online \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-004","caller":"scheduler","operator":"system","regionCode":"CN","idempotencyKey":"idem-online-001","activityId":"<activityId>"}'
```

### 领券 -> 核销
```bash
# 领券
curl -X POST http://localhost:8080/api/coupon/receive \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-010","caller":"c-app","operator":"user-100","regionCode":"CN","idempotencyKey":"idem-recv-001","couponInstId":"<couponInstId>","userId":"user-100"}'

# 核销（orderId为幂等键）
curl -X POST http://localhost:8080/api/coupon/use \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-011","caller":"order-system","operator":"system","regionCode":"CN","idempotencyKey":"idem-use-ORD001","couponInstId":"<couponInstId>","userId":"user-100","orderId":"ORD001","activityId":"<activityId>","usedAmount":20.00}'
```

### 下单占用 -> 支付确认
```bash
# 下单占用
curl -X POST http://localhost:8080/api/quota/occupy \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-020","caller":"order-system","operator":"system","regionCode":"CN","idempotencyKey":"idem-occ-ORD001","activityId":"<activityId>","userId":"user-100","orderId":"ORD001","quantity":1}'

# 支付确认
curl -X POST http://localhost:8080/api/quota/confirm \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-021","caller":"payment-system","operator":"system","regionCode":"CN","idempotencyKey":"idem-cfm-ORD001","activityId":"<activityId>","userId":"user-100","orderId":"ORD001"}'
```

## 测试运行

### 运行所有测试（单元测试 + 集成测试）
```bash
mvn test
```

### 仅运行单元测试
```bash
mvn test -Dtest="com.ump.marketing.domain.*Test"
```

### 仅运行集成测试
```bash
mvn test -Dtest="com.ump.marketing.integration.*Test"
```

### 打包（含测试）
```bash
mvn clean package
```

### 测试覆盖的核心场景

**单元测试（domain层）**：
- Activity状态机合法/非法转换（10个合法转换、终止态不可转换、禁止ONLINE->DRAFT等）
- Coupon状态机合法/非法转换（USED后不可再用、EXPIRED不可核销）
- scope_key生成稳定性（相同输入相同输出、不同输入不同输出）
- 分表路由稳定性（结果在[0,N)范围内、确定性、Integer.MIN_VALUE防护）
- 幂等键校验（null/empty抛异常）
- 乐观锁参数校验
- Region路由校验

**集成测试（H2 + Mock Kafka）**：
- 创建活动 -> 提交审批 -> 审批通过 -> 上线 -> B/C同步事件已发送
- 审批驳回 -> 重新编辑
- 暂停/恢复切换
- **强制下线**：强制下线后C端黑名单缓存生效、DB状态为TERMINATED
- 商品绑定 -> scope_key生成 -> C端按scope查询命中活动
- 券模板创建 -> 发券 -> 用户领券 -> 核销 -> 重复核销幂等（相同orderId返回成功，不同orderId返回BUSINESS_CONFLICT）
- 下单占用 -> 取消释放 -> 再次占用成功
- 下单占用 -> 支付确认 -> 确认后不可释放
- 重复占用幂等返回首次结果
- **Region隔离**：CN活动US查不到，US活动CN查不到
- **DLQ**：Kafka发送失败时消息进入DLQ，processRetries()不抛异常

## 错误码说明

| code | 含义 |
|------|------|
| 0 | SUCCESS |
| 40001 | INVALID_ARGUMENT - 参数非法 |
| 40002 | ILLEGAL_STATE - 当前状态不允许此操作 |
| 40003 | VERSION_CONFLICT - 乐观锁冲突 |
| 40004 | IDEMPOTENCY_CONFLICT - 同幂等键不同请求体 |
| 40301 | PERMISSION_DENIED - 权限不足 |
| 40401 | RESOURCE_NOT_FOUND - 资源不存在 |
| 40901 | BUSINESS_CONFLICT - 业务冲突（如已核销/已释放） |
| 50001 | DB_ERROR - 数据库错误 |
| 50002 | SYNC_ERROR - 同步错误 |
| 50003 | KAFKA_ERROR - Kafka错误 |
| 50004 | DOWNGRADED - 服务降级 |
| 50005 | INTERNAL_ERROR - 内部错误 |

## 幂等规则

- 所有写接口必须传入 `idempotency_key`，格式：`{caller}:{operation}:{biz_request_id}`
- 幂等记录保存7天（t_idempotency_record.expired_at）
- 相同 key + 相同请求体：返回首次响应
- 相同 key + 不同请求体：返回 IDEMPOTENCY_CONFLICT(40004)
- 订单维度幂等（uk_order = region_code:order_id:user_id:activity_id）保证占用/核销/释放的调用安全

## B/C同步机制

```
B端MySQL -> Canal(BinlogListener) -> Kafka -> C端消费者 -> C端运行时分表
```

- SyncEvent包含：eventId（全局唯一）、eventType、aggregateType、aggregateId、regionCode、version、payload、occurredAt
- aggregateId + version单调递增，消费端只接受更高版本
- 消费失败策略：
  - 反序列化/业务校验失败 -> 进入DLQ
  - DB写入失败重试3次 -> 进入DLQ
  - 版本倒挂超过5分钟 -> 进入DLQ
- DLQ每1分钟扫描（processRetries），指数退避（1min~16h，最多10次）
- 支持event_id手动重放（manualReplay）

## 强制下线特殊流程

1. 先写B端状态为TERMINATED（绕过审批，任意非终态可强制下线）
2. 立即发布ACTIVITY_FORCE_OFFLINE高优先级事件
3. 写审计日志（记录reason）
4. 写入本地黑名单缓存（TTL 24小时），C端查询时黑名单缓存兜底
5. Kafka发送失败 -> DLQ（P0级告警）

## Region Cell国际化隔离

- 所有请求必须携带regionCode
- 所有表数据包含region_code字段
- RegionRouter.assertRegionAccess()在C端查询时校验跨Region访问（抛SecurityException）
- C端运行表按region_code + shard_key分表，物理隔离
- Region Cell配置在t_region_cell表，包含db_shard_key、redis_namespace、kafka_topic_prefix等路由信息

## 主要设计取舍

1. **单模块Maven**：为Sprint 1快速落地，采用单模块Maven + 包结构分层（符合"不方便多模块允许单模块"的约定）。
2. **Mock Kafka/Canal**：使用内存ConcurrentHashMap模拟Kafka发送和Canal binlog监听，接口抽象完整，生产环境替换为真实实现只需替换@Primary Bean。
3. **Caffeine本地缓存**：使用Caffeine作为本地缓存（黑名单等），生产可替换为Redis，接口为LocalCache。
4. **业务表自读**：遵循v0.9.3终极简化方案——业务表自己就是读视图、自己就是兜底，不构建额外的聚合视图层。
5. **乐观锁CAS**：配置类写操作使用version字段乐观锁（where id=? and version=?），状态变更使用CAS（where status=old_status）。
6. **H2 MySQL模式测试**：测试使用H2内存库MODE=MySQL，DDL同时兼容H2和MySQL 8。
7. **分表动态表名**：C端分表使用MyBatis XML ${tableSuffix}（非预编译参数）实现动态表名路由，ShardingRouter集中路由逻辑。

## 尚未实现 / 需真实外部系统确认

1. **真实Kafka/Canal接入**：当前为Mock实现，生产接入需替换MockKafkaProducer/MockCanalBinlogListener为真实Kafka Producer和Canal Client。
2. **B端审批流真实对接**：当前approverId为直接传入，真实场景需对接审批系统（activity_change_request工作流）。
3. **Redis缓存替换**：当前Caffeine为本地缓存，分布式部署时需要替换为Redis（LocalCache接口已抽象）。
4. **BINLOG监听（Canal）**：CanalBinlogListener接口已定义，但B->C同步在当前版本中由应用服务在写DB后直接发布SyncEvent；生产环境通过Canal监听binlog触发，避免双写。
5. **C端消费者实现**：当前SyncEvent直接在MockKafkaProducer中同步dispatch，生产环境需要独立的消费者组（4个消费者组）实现异步消费。
6. **定时任务调度**：DlqService.processRetries()需要@Scheduled定时触发（已加@EnableScheduling），生产环境需XXL-Job或ShedLock保证集群只执行一次。
7. **监控告警**：告警接口（forceOffline失败、DLQ积压、跨Region访问等）定义了日志点，但未接入真实监控系统（Prometheus/Alertmanager）。
8. **退款退券接口**：CouponInstanceMapper.refund()已实现，但未暴露独立的refundCoupon RPC（可通过useCoupon的逆操作扩展）。
9. **管理后台UI**：v1明确不做，仅提供REST API。
10. **ODPS离线表**：v1不做实时数仓，ODPS T+1离线表需数据平台配合同步。

## 工程目录总览

```
ump-marketing/
├── pom.xml
├── README.md
└── src/
    ├── main/
    │   ├── java/com/ump/marketing/
    │   │   ├── UmpMarketingApplication.java
    │   │   ├── api/{dto,enums,result}/
    │   │   ├── domain/{model,statemachine,service}/
    │   │   ├── application/service/
    │   │   ├── infrastructure/{mapper,messaging,cache,sharding,dlq,config}/
    │   │   └── web/controller/
    │   └── resources/
    │       ├── application.yml
    │       ├── schema.sql
    │       ├── schema-mysql.sql
    │       └── mapper/{ScopeActivityMapper,CouponInstanceMapper,OrderOccupyMapper}.xml
    └── test/
        ├── java/com/ump/marketing/
        │   ├── domain/ (5个单元测试)
        │   └── integration/ (7个集成测试)
        └── resources/
            └── application.yml
```
