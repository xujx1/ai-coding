# 持久化运行手册

本手册适用于 PostgreSQL 与 S3/MinIO 已按生产配置启用的部署。生产运行时不允许降级到本地文件存储。

## 迁移与切换

1. 先在副本环境执行存储迁移的 dry-run，记录每个 run 的校验和、失败原因和产物数量。
2. 为每个 run 使用独立数据库事务导入；失败后仅重试该 run，禁止跳过错误并宣布切换完成。
3. 比较文件快照与数据库快照的 canonical checksum，并抽样回放生命周期和事件序列。
4. 影子写入阶段仍以文件为唯一读权威；监控不匹配数和写入错误。
5. 切换前暂停新工作、完成 outbox 积压、确认没有有效 lease；切换后只以 PostgreSQL 读取。

Shadow writer 只在迁移观察窗口显式启用：

```bash
AI_CODING_PROFILE=local \
AI_CODING_STORAGE_DRIVER=file \
AI_CODING_POSTGRES_SHADOW_WRITE=1 \
AI_CODING_SHADOW_DATABASE_URL=postgresql:///ai_coding_shadow \
npm start
```

读权威始终由 `AI_CODING_STORAGE_DRIVER=file` 决定。shadow 写失败只增加
`storage_shadow_write_errors_total`，比较差异增加 `storage_shadow_mismatch_total`，不得改变接口响应。
进入 PostgreSQL cutover 前必须得到 mismatch 为 0 的 readiness 记录。回滚窗口结束后删除
`AI_CODING_POSTGRES_SHADOW_WRITE` 和 `AI_CODING_SHADOW_DATABASE_URL`，默认关闭的 shadow writer 即不再构造；
`storage:migrate`/`storage:verify` 的兼容读取能力保留两个发布周期。

```bash
npm run storage:migrate -- --from runtime-projects --dry-run
npm run storage:migrate -- --from runtime-projects --apply --tenant default
npm run storage:verify -- --from runtime-projects --tenant default
```

## 回滚、备份与恢复

- 切换前：将 driver 保持为显式 file 配置即可回退。
- 切换后：暂停写入，导出兼容文件快照，验证校验和后才修改 driver；禁止运行时自动回退。
- PostgreSQL 备份须覆盖 runs、events、leases、outbox、artifact metadata 和 migration records；对象存储按 retention class 做版本化或跨区复制。
- 恢复演练应在隔离环境恢复数据库和对象存储，然后验证 run、事件序号、生命周期和下载产物的一致性。

```bash
npm run storage:export -- --to rollback-runtime-projects --run <runId> --tenant default
```

## PostgreSQL 通知降级与 Outbox 积压

- `LISTEN/NOTIFY` 连接不可用时，停止把实时通知当作成功条件；已提交状态和事件仍在 PostgreSQL。
- API listener 使用独立连接和有界退避自动重连；客户端使用 `afterSequence` 重放缺失事件。恢复连接后重启 publisher 或等待其下一次 claim。
- 按 tenant 检查 pending、attempt_count、next_attempt_at 与 terminal failure；publisher 会跨租户领取，但每条通知保留原 tenantId。不要手工标记 outbox 已发布来清空积压。
- `pg_notify` 与 `published_at` 由同一条 PostgreSQL 语句提交；若发现已通知但仍 pending，优先排查旧版本 publisher 或人工 SQL，不要再次拆分通知与确认操作。
- 对持续失败事件先修复数据库凭据、TLS、连接数、网络或 payload 问题，再按幂等 eventId 重试。

## Lease 与 Worker 恢复

- Worker 在执行节点前获得 PostgreSQL lease，并在模型、构建、测试和浏览器操作期间 heartbeat。
- Worker 意外退出后，等待 TTL 到期；新 Worker 以新 fencing token 接管并依据 durable workspace sources 重建本地目录。
- 拒绝使用过期 fencing token 的完成提交。不要人工修改 lease 行来“解锁”仍可能运行的 Worker。

## 产物与工作区清理

- 工作区是可重建缓存；使用 `WorkspaceManager.cleanup({ dryRun: true })` 先审阅过期目录，再执行删除。
- 临时对象通过 `ArtifactSweeper` 处理：先 dry-run，提供正式 metadata 引用判定，保存 cleanup record 后再执行删除。
- workspace retention 与 artifact retention 独立：删除 workspace 不得删除 session、lifecycle、事件或已提交对象。
- 对象清扫仅枚举当前 tenant 的 `temporary/` 前缀；禁止对 bucket 根目录做递归删除。

```bash
npm run storage:cleanup -- --tenant default       # dry-run
npm run storage:cleanup -- --tenant default --apply
```

## 事故取证

保留 runId、nodeId、workerId、lease fencing token、transaction id、event sequence、outbox eventId 和 artifact storage key。用事件序列和 checksum 还原一次状态转换；不要用进程日志替代持久化审计记录。
