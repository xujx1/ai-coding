# 节点设计

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [架构设计](architecture.md) ｜ [节点流转设计](node-transition.md) ｜ [上下文压缩设计](context-compression.md)

## 设计原则

流水线节点是固定的，定义在 `src/pipeline/definition.ts`。节点不是可视化拖拽工作流，而是一条专门服务 MRD-to-Code 的交付链路。

每个节点都需要明确：

- 输入产物。
- 输出产物。
- 是否需要确认门。
- 是否使用 ReAct 工具 loop。
- 是否项目级并发执行。
- 下游读取哪些正式产物。

## 节点总览

```text
Upload / Init
  -> 需求拆解
  -> 实施方案
  -> SPEC生成
  -> Java Impl
  -> Test Code Generate
  -> Archive
```

## Upload / Init

职责：

- 初始化 run 目录。
- 处理上传的需求文件和项目代码。
- 解压项目 zip。
- 识别 Maven 项目。
- 生成输入摘要和项目 manifest。

输入：

- 用户上传的 MRD/需求文件。
- 用户上传的项目目录或项目 zip。

输出：

- `artifacts/input-summary.md`
- `artifacts/project-manifest.json`

确认门：

- 无。

下游契约：

- `project-manifest.json` 必须列出需求文件和项目列表。
- `input-summary.md` 给页面展示上传内容。

## 需求拆解

职责：

- 读取所有需求文件和 `project-manifest.json`。
- 识别功能清单、项目归属、实施边界和待澄清问题。
- 对可自行判断的问题直接给出默认决策。
- 对阻断问题生成澄清问题。

输入：

- `input/*`
- `artifacts/project-manifest.json`

输出：

- `artifacts/mrd-clarified.md`
- `artifacts/mrd-clarify-questions.md`

确认门：

- 有。
- 用户确认后进入 `实施方案`。
- 用户反馈后当前节点重跑。

下游契约：

- 后续节点以 `mrd-clarified.md` 为需求事实来源。
- `mrd-clarify-questions.md` 记录用户参与过的澄清过程。

## 实施方案

职责：

- 基于澄清后的 MRD 生成 PRD。
- 结合项目代码生成项目级技术方案。
- 产出实施边界、候选改动文件、测试策略和风险。

输入：

- `artifacts/mrd-clarified.md`
- `artifacts/mrd-clarify-questions.md`
- `artifacts/project-manifest.json`
- 项目代码结构。

输出：

- `artifacts/prd.md`
- `artifacts/implementation-plan-manifest.json`
- `artifacts/<project>/tech-design.md`

确认门：

- 有。
- 用户确认后进入 `SPEC生成`。
- 用户反馈后当前节点重跑。

下游契约：

- Spec 节点读取 PRD 和项目级技术方案。
- 技术方案必须是结构化 Markdown，便于模型和用户复核。

## SPEC生成

职责：

- 把 PRD 和技术方案拆成可执行开发任务清单。
- 生成测试任务清单。
- 任务格式类似 OpenSpec `task.md`，使用 `- [ ]` 表示待办。

输入：

- `artifacts/prd.md`
- `artifacts/implementation-plan-manifest.json`
- `artifacts/<project>/tech-design.md`

输出：

- `artifacts/<project>/openspec-task.md`
- `artifacts/<project>/openspec-test-task.md`
- `artifacts/spec-manifest.json`

确认门：

- 无。

下游契约：

- `Java Impl` 根据 `openspec-task.md` 实现。
- `Test Code Generate` 根据 `openspec-test-task.md` 生成测试。
- 后续完成任务时在原任务清单上打勾，不重复生成另一份任务文件。

## Java Impl

职责：

- 读取任务清单、PRD、技术方案和项目代码。
- 使用工具真实修改 Java 代码。
- 编译检查。
- 执行代码审查。
- 如果 review 出现 BLOCK，触发回退到当前节点修复。

输入：

- `artifacts/<project>/openspec-task.md`
- `artifacts/prd.md`
- `artifacts/<project>/tech-design.md`
- `workspace/project`

输出：

- `artifacts/<project>/changed-files.json`
- `artifacts/<project>/code-preview-manifest.json`
- `artifacts/<project>/changed-files/*`
- `artifacts/<project>/code-review.md`
- `artifacts/<project>/review-findings.json`

确认门：

- 无。

执行方式：

- ReAct 工具 loop。
- 允许 `read_file`、`glob`、`grep`、`edit_file`、`write_file`、`maven_compile` 等工具。

下游契约：

- 测试节点依赖实际修改后的代码。
- 右侧产物通过 `changed-files.json` 和 `code-preview-manifest.json` 展示变更列表。

## Test Code Generate

职责：

- 根据测试任务清单生成或修改测试代码。
- 执行 Maven 单元测试。
- 生成测试报告。
- 对失败进行分类，决定回退到实现节点还是测试节点。

输入：

- `artifacts/<project>/openspec-test-task.md`
- `artifacts/<project>/changed-files.json`
- 项目代码和测试代码。

输出：

- `artifacts/<project>/changed-test-files/*`
- `artifacts/<project>/test-file-list.md`
- `artifacts/<project>/testcode-generation-report.md`
- `artifacts/<project>/test-report.md`
- `artifacts/<project>/surefire-summary.json`
- `artifacts/<project>/coverage-summary.json`
- `artifacts/<project>/failure-classification.json`
- `artifacts/<project>/autofix-history.md`

确认门：

- 无。

执行方式：

- ReAct 工具 loop。
- 内部合并测试代码生成和 Maven 单元测试执行。

下游契约：

- 归档节点读取测试报告、失败分类和变更测试文件列表。

## Archive

职责：

- 汇总所有正式产物。
- 统计节点耗时、工具耗时、工具失败数和 token 消耗。
- 生成项目级归档报告。
- 打包最终项目代码。

输入：

- 全部正式产物。
- `execution-state.json`
- `logs/events.ndjson`
- `agents/*.json`

输出：

- `artifacts/<project>/archive-report.md`
- `artifacts/archive-manifest.json`
- `downloads/<runId>-projects.zip`

确认门：

- 无。

下游契约：

- 这是交付终点。
- 页面可下载项目包。

## 节点合并关系

为了减少用户确认点和重复产物，当前把早期设计中的部分节点合并：

- `mrd-render` + `mrd-clarify` 合并为 `需求拆解`。
- `java-impl` + `java-review` 合并为 `Java Impl`。
- `testcode-generate` + `maven-test-runner` 合并为 `Test Code Generate`。

旧节点 ID 通过 `LEGACY_STAGE_ID_MAP` 做兼容。
