# 持久化架构升级与 Demo 依赖解耦验收报告

更新时间：2026-10-24

当前结论：**通过本地等价门禁验收，远程 CI 门禁已配置；可在 CI 首次通过后进入受控 PostgreSQL cutover。**

生产权威源为 PostgreSQL，实时通知为 PostgreSQL `LISTEN/NOTIFY`，正式 Artifact 使用 S3-compatible
对象存储。Shadow writer 默认关闭且只能在 file 权威的迁移观察期显式启用；生产不会自动回退文件。

## 1. 全量自动化回归

```bash
npm test
```

结果：`238 total / 233 pass / 0 fail / 5 skip`。

- 2 个 skip：当前 checkout 不含可选历史 Demo golden fixture。
- 1 个 skip：production-no-demo 专用场景只在隔离副本/CI 启用。
- 2 个 skip：常规回归未启动 S3 服务，S3 集成测试在第 4 节单独真实执行。
- PostgreSQL fencing、事务锁、原子终态、tenant 隔离、checkpoint/recovery、通知恢复均真实执行。

## 2. 多进程与并发正确性

`postgres-multi-process-e2e.test.ts` 结果：`3 pass / 0 fail / 0 skip`。

| 场景 | 结果 |
| --- | --- |
| 两个 API 共享 PostgreSQL session，API 重启后恢复 | 通过 |
| 跨 API `LISTEN/NOTIFY` 与 `afterSequence` replay | 通过，无事件缺口 |
| Worker owner 被 SIGKILL 后 lease 接管 | 通过 |
| stale Worker 以旧 fencing token 提交 | 被拒绝，无重复终态 |
| listener 断线重连、publisher 重启与 outbox 补发 | 通过 |
| `pg_notify` 与 `published_at` 原子提交 | 通过 |

Legacy、LangGraph、AI Testing 使用同一个 fenced 原子提交契约，真实 PostgreSQL 测试覆盖
run/lifecycle/artifact metadata/event/outbox 的事务边界。

## 3. 历史迁移、Shadow 与回滚演练

已执行真实 PostgreSQL 演练：

1. file-authoritative shadow 写入 PostgreSQL，读取仍返回 file 权威结果。
2. canonical snapshot compare 为 `0 mismatch`，形成 cutover readiness。
3. checkpoint 与 execution/node/project/Agent/lifecycle/workflow/event 在同一 UnitOfWork 导入。
4. 使用官方 LangGraph PostgreSQL checkpointer按 `thread_id=runId` 真实读回迁移 checkpoint。
5. 暂停新写入并确认 run 无有效 lease。
6. 切换 PostgreSQL 主读，执行 export → checksum verify → compatible file rollback。
7. rollback snapshot 再次通过 `storage:verify`。

结果：`shadow-storage.test.ts` 2/2 通过；`storage-rollout-rehearsal.test.ts` 1/1 通过。

Shadow 写失败仅记录 `storage_shadow_write_errors_total`；compare 差异记录
`storage_shadow_mismatch_total`。回滚窗口后删除 shadow 环境变量，运行时不再构造 shadow writer；
迁移 reader 保留两个发布周期。

## 4. S3-compatible Artifact 与分裂失败

本机启动独立 S3-compatible 服务后执行：

```bash
RUN_S3_INTEGRATION=1 \
DATABASE_URL=postgresql:///ai_coding_test \
S3_ENDPOINT=http://127.0.0.1:9000 \
S3_BUCKET=ai-coding-artifacts \
node --test dist/__tests__/s3-postgres-integration.test.js
```

结果：`2 pass / 0 fail / 0 skip`。

- 真实 put/head/get/delete、SHA-256/size 校验、PostgreSQL committed metadata 通过。
- 对象上传后数据库事务失败：对象保持 temporary/sweepable，正式 metadata 不存在。
- 对象存储不可达：数据库不产生正式 metadata。
- `.github/workflows/production-without-demo.yml` 已配置固定官方 MinIO 容器以重复执行同一门禁；
  本报告未把尚未执行的远程 workflow 记为通过证据。

## 5. Production 无 Demo 与 ecom Demo HTTP E2E

在一次性隔离副本中物理排除 `demo/`，使用 PostgreSQL 与独立 S3-compatible 服务执行：

```bash
npm run test:production-without-demo
```

本地等价门禁结果：`238 total / 231 pass / 0 fail / 7 skip`。7 个 skip 都明确标记为 Demo-only/fixture-only；
所有非 Demo 测试、真实 PostgreSQL 测试、S3 集成测试和 production HTTP 冒烟均执行。

Production HTTP 验证结果：

- build 与 startup 通过，监听前 readiness 通过。
- `/api/health` 的 database、eventBus、artifactStore 均为 `ok`。
- sessions、management overview、Ops、workflows、metrics 核心 API 均返回 200。
- `/api/demo/full-flow` 返回 404。

独立 ecom-demo HTTP E2E：`1 pass / 0 fail`，覆盖 application catalog、requirement 文件读取、
AI Testing dry-run workflow、AI Ops evidence workflow 和 Demo-only route 注册。

## 6. 性能基线

`npm run storage:load-test` 使用 PostgreSQL 18.4 的既有独立复跑结果：

| 指标 | 实测 | 目标 | 结果 |
| --- | ---: | ---: | --- |
| 并发活跃 run | 100 | 100 | 通过 |
| 并发 node transition | 20 | 20 | 通过 |
| 单 run event | 100,000 | 100,000 | 通过，无 sequence 缺口 |
| session list P95 | 2.05 ms | < 300 ms | 通过 |
| 状态更新 P95 | 4.19 ms | < 200 ms | 通过 |
| event 分页 P95（每页 1,000） | 20.57 ms | 记录项 | 通过 |
| Worker lease 接管 | 269.83 ms | < 90,000 ms | 通过 |

## 7. 最终不变量

| 不变量 | 证据 | 结论 |
| --- | --- | --- |
| 无 source-of-truth fallback | production config/architecture test、无 Demo startup | 通过 |
| 无 duplicate completion | 双 Worker stale fencing 与幂等 transition | 通过 |
| 无 event gap | durable sequence replay、listener/publisher restart | 通过 |
| 无 orphaned formal artifact | S3/DB 双向分裂测试、temporary sweeper | 通过 |
| 无 unbounded local workspace | 独立 workspace TTL、cleanup 与 takeover reconstruction | 通过 |

## 8. 发布约束

- 首次发布仍按 runbook 执行备份、暂停写入、outbox/lease 检查和分阶段流量切换。
- 生产必须使用 TLS PostgreSQL 与 HTTPS S3 endpoint；明文基础设施例外仅在
  `NODE_ENV=test` 且显式设置 `AI_CODING_ALLOW_INSECURE_TEST_INFRA=1` 时有效。
- CI 的官方 MinIO job 必须保持为合并门禁；不得用 unit mock 替代。
- 回滚窗口内保留数据库备份、对象版本和 file exporter，禁止清理正式 Artifact。
