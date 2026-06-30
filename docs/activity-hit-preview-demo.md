# 活动命中预览真实 Case

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [架构设计](architecture.md) ｜ [动态工作流读模型](session-dynamic-workflow.md)

这是当前用于 GitHub 分享的真实端到端 case。它来自一次真实上传、真实模型执行、真实工具读写、真实 Maven/E2E 验证后的完整运行快照。

## Case 概览

- 名称：活动命中预览
- 原始 run：`PDRbY_AI59`
- 固化快照：`fixtures/activity-hit-preview-demo/run`
- MRD：`example/activity-hit-preview-mrd.md`
- 应用：`marketing`、`marketing-admin`
- 结果：完成需求拆解、项目分流、双应用实现、后端测试、前端测试、E2E 验证、跨应用测试和归档

![动态多应用工作流](png/activity-hit-preview-dynamic-workflow.png)

## 业务背景

运营人员在配置活动后，需要用商品、SKU、区域等条件快速确认活动是否命中，并区分管理配置侧和用户运行侧结果。这个需求天然跨两个应用：

- `marketing`：提供用户运行侧只读命中预览接口。
- `marketing-admin`：提供运营侧聚合接口和前端交互，展示管理配置侧、运行侧和差异提示。

## 动态流程

系统不是把所有上传项目都塞进同一条固定流水线，而是为本次 session 生成 `workflowInstance`：

```text
上传初始化
  -> 需求归属确认
  -> 需求拆解
  -> 项目分流
  -> marketing 分支
  -> marketing-admin 分支
  -> 分支汇合
  -> 跨应用测试
  -> 归档
```

Fanout 决策来自：

- `artifacts/project-manifest.json`
- `artifacts/requirement-ownership.json`
- `artifacts/fanout-decision.json`

![工作流实例](png/activity-hit-preview-workflow-instance.png)

## 分支和 Track

`marketing` 是后端服务：

```text
implementation-plan
  -> spec-generate
  -> backend: java-impl -> backend-test
```

`marketing-admin` 同时包含后端聚合接口和静态前端：

```text
implementation-plan
  -> spec-generate
  -> backend: java-impl -> backend-test
  -> frontend: frontend-impl -> frontend-test
  -> e2e: e2e-verify
```

![分支 tracks](png/activity-hit-preview-branch-tracks.png)

## 关键产物

需求和分流：

- `artifacts/mrd-clarified.md`
- `artifacts/requirement-ownership.json`
- `artifacts/fanout-decision.json`

应用方案和任务：

- `artifacts/marketing/tech-design.md`
- `artifacts/marketing-admin/tech-design.md`
- `artifacts/marketing/openspec/changes/run-pdrby_ai59-marketing/tasks.md`
- `artifacts/marketing-admin/openspec/changes/run-pdrby_ai59-marketing-admin/tasks.md`

代码和测试：

- `artifacts/marketing/changed-files.json`
- `artifacts/marketing-admin/changed-files.json`
- `artifacts/marketing/test-report.md`
- `artifacts/marketing-admin/test-report.md`
- `artifacts/marketing-admin/frontend-test-report.md`
- `artifacts/marketing-admin/e2e/verification-summary.md`
- `artifacts/marketing-admin/e2e/screenshots/home.png`

跨应用和归档：

- `artifacts/cross-app/test-results.json`
- `artifacts/cross-app/delivery-metadata.json`
- `artifacts/marketing/archive-report.md`
- `artifacts/marketing-admin/archive-report.md`
- `artifacts/archive-manifest.json`
- `artifacts/downloads/PDRbY_AI59-projects.zip`

![跨应用测试](png/activity-hit-preview-cross-app-test.png)

![归档下载](png/activity-hit-preview-archive.png)

## GitHub 展示重点

- 真实多项目输入：不是单文件 prompt demo。
- Session 级动态工作流：同一个模板按 MRD 和项目能力生成不同分支。
- 应用级隔离：每个分支有自己的节点、track、Agent、产物和失败状态。
- 工具真实执行：代码变更、Maven 编译/测试、前端静态资源修改、E2E 验证都有轨迹。
- 可复盘交付：事件、Agent 状态、工具日志、正式产物和归档报告都保留在 run 目录。

## 复现方式

启动服务后默认注入这个 demo：

```bash
npm install
npm run build
npm start
```

访问：

```text
http://localhost:3000
```

如果只想保留空白环境：

```bash
AI_CODING_AUTO_DEMO=0 npm start
```

## 快照说明

`fixtures/activity-hit-preview-demo/run` 是只读演示快照。服务启动时会复制到 `runtime-projects/runs/<newRunId>`，并重写 runId 和真实绝对路径。复制后的运行态目录可以自由查看、下载或删除，不会修改 fixture。
