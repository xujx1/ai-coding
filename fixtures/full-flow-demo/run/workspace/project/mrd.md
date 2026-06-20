# 活动软删除能力 MRD

## 1. 背景

当前活动管理已支持创建、编辑、提审、审批、驳回、上线、暂停和强制下线能力，但不支持运营侧删除活动。实际运营过程中，草稿活动、被驳回活动或已终止活动可能因为配置错误、重复创建、测试数据等原因不再需要继续展示和维护。

系统表 `t_activity` 已具备 `is_deleted` 字段，查询逻辑也普遍按 `is_deleted = 0` 过滤，但业务代码尚未暴露活动删除入口。本需求补齐活动软删除能力。

## 2. 目标

为活动管理新增软删除能力，使运营人员可以删除不再使用的活动，同时保留数据库记录用于审计和问题追溯。

## 3. 范围

### 3.1 本期包含

- 新增活动删除接口。
- 支持按 `activityId + regionCode` 软删除活动。
- 删除时更新 `t_activity.is_deleted`、`updated_at`、`updated_by` 和 `version`。
- 删除操作记录审计日志。
- 删除接口支持幂等控制。
- 增加基础测试覆盖。

### 3.2 本期不包含

- 不做物理删除。
- 不删除活动关联的券模板、券实例、商品绑定、订单占用记录。
- 不做批量删除。
- 不做活动回收站和恢复能力。
- 不新增前端页面。

## 4. 业务规则

### 4.1 可删除状态

仅允许删除以下状态的活动：

- `DRAFT`
- `REJECTED`
- `TERMINATED`

### 4.2 不可删除状态

以下状态不允许删除：

- `PENDING_APPROVAL`
- `APPROVED`
- `ONLINE`
- `PAUSED`

不可删除时返回非法状态错误，错误信息需包含当前活动状态。

### 4.3 删除结果

删除成功后：

- `t_activity.is_deleted` 更新为 `1`。
- `updated_at` 更新为当前时间。
- `updated_by` 更新为当前操作人。
- `version` 自增。
- 后续通过现有活动查询逻辑不可再查到该活动。

### 4.4 幂等要求

删除接口需要校验 `idempotencyKey`。

- 相同 `idempotencyKey`、相同请求内容重复提交，应返回首次处理结果。
- 相同 `idempotencyKey`、不同请求内容重复提交，应返回幂等冲突。

### 4.5 审计要求

删除成功后写入操作审计日志：

- `operationType`: `DELETE_ACTIVITY`
- `aggregateType`: `Activity`
- `aggregateId`: 活动 ID
- `regionCode`: 活动区域
- `beforeJson`: 删除前活动快照
- `afterJson`: 删除后活动快照

## 5. 接口设计

### 5.1 删除活动

接口：

```http
POST /api/activity/delete
```

请求体：

```json
{
  "requestId": "req_001",
  "idempotencyKey": "idem_001",
  "activityId": "act_001",
  "regionCode": "CN",
  "operator": "admin"
}
```

成功响应：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "success",
  "data": null,
  "requestId": "req_001"
}
```

活动不存在响应：

```json
{
  "success": false,
  "code": "RESOURCE_NOT_FOUND",
  "message": "Activity not found",
  "data": null,
  "requestId": "req_001"
}
```

状态不允许删除响应：

```json
{
  "success": false,
  "code": "ILLEGAL_STATE",
  "message": "Only DRAFT, REJECTED or TERMINATED activities can be deleted, current status: ONLINE",
  "data": null,
  "requestId": "req_001"
}
```

## 6. 数据变更

无需新增表和字段。

复用 `t_activity.is_deleted` 字段。

建议新增 mapper 方法：

```sql
UPDATE t_activity
SET is_deleted = 1,
    version = version + 1,
    updated_at = #{updatedAt},
    updated_by = #{updatedBy}
WHERE activity_id = #{activityId}
  AND region_code = #{regionCode}
  AND status = #{status}
  AND version = #{version}
  AND is_deleted = 0
```

## 7. 开发拆分

### 7.1 DTO

新增：

- `DeleteActivityRequest`

字段：

- `requestId`
- `idempotencyKey`
- `activityId`
- `regionCode`
- `operator`

### 7.2 Controller

`ActivityController` 新增：

```java
@PostMapping("/delete")
public RpcResult<Void> delete(@RequestBody DeleteActivityRequest req) {
    return activityService.deleteActivity(req);
}
```

### 7.3 Service

`ActivityService` 新增 `deleteActivity` 方法。

核心流程：

1. 校验 `regionCode`。
2. 校验 `idempotencyKey`。
3. 幂等检查。
4. 查询活动。
5. 校验活动状态是否允许删除。
6. 执行软删除。
7. 写审计日志。
8. 标记幂等完成。
9. 返回成功。

### 7.4 Mapper

`ActivityMapper` 新增软删除方法：

- `softDelete`

## 8. 验收标准

- `DRAFT` 活动调用删除接口后，数据库 `is_deleted = 1`。
- `REJECTED` 活动调用删除接口后，数据库 `is_deleted = 1`。
- `TERMINATED` 活动调用删除接口后，数据库 `is_deleted = 1`。
- `ONLINE` 活动调用删除接口返回 `ILLEGAL_STATE`。
- 删除后的活动通过现有 `selectByActivityId` 查询不到。
- 删除成功后写入 `DELETE_ACTIVITY` 审计日志。
- 重复提交相同删除请求返回幂等结果。
- 项目测试通过。

## 9. 工期评估

预计 1 人日。

拆分如下：

- DTO、Controller、Mapper：0.2 人日
- Service 业务逻辑和审计：0.4 人日
- 测试用例：0.3 人日
- 联调和问题修复：0.1 人日

