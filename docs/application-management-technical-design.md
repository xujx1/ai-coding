# 应用管理产品演示与技术方案

应用管理是 AI Coding 平台的应用事实入口。需求 PI 不再由用户上传项目文件决定候选应用，而是从应用管理中读取应用列表、仓库路径、业务域、技术栈、接口和知识库状态，再结合知识库和 GitNexus 做影响面判断。

## 产品特色

- 是平台的应用台账，提供所有 AI 产品共用的应用事实。
- 支持维护应用仓库、业务域、技术栈、接口、上下游和知识库状态。
- 需求 PI 从这里拿候选应用，不再依赖用户上传项目。
- AI Ops 从这里选择告警所属应用。
- AI Testing 从这里判断部署和测试范围。

## 演示路径

1. 进入应用管理页面。
2. 查看 ecom demo 的 15 个应用。
3. 观察每个应用的业务域、技术栈和能力标签。
4. 切换到知识库管理，查看应用如何生成知识库。
5. 回到需求 PI，观察系统如何从这些应用中命中影响范围。

## 示例

### 应用记录示例

```json
{
  "id": "ecom-inventory",
  "name": "ecom-inventory",
  "domain": "inventory",
  "repositoryType": "application",
  "capabilities": ["库存查询", "库存保护", "库存可用性校验"],
  "techStack": ["java", "dubbo", "http"],
  "implementationApp": true
}
```

### 需求 PI 使用示例

MRD 中出现：

```text
库存保护校验、库存不足、可用库存
```

应用管理提供候选：

```text
ecom-inventory
```

知识库进一步验证：

```text
ecom-inventory 拥有库存可用性校验和库存保护能力
```

最终进入：

```text
fanout-decision.includedProjects
```

## 目标

- 统一维护平台可识别的应用清单。
- 为需求归属确认提供候选应用集合。
- 为知识库生成提供仓库路径和应用元数据。
- 为 AI Ops 提供告警归属应用和业务域。
- 为 AI Testing 提供部署应用、测试范围和回归范围。

## 产品定位

应用管理是平台的“应用事实台账”。没有应用管理，需求 PI 就会退化成上传项目文件或模型自由猜测影响范围。

它面向平台管理员、架构师和研发负责人，维护 AI 系统可以引用的应用事实。

## 页面视角

![应用管理](png/readme-app-management.png)

## 数据内容

应用管理至少维护：

- 应用 ID / 名称
- 仓库路径
- 应用类型：frontend、backend、fullstack、testing、documentation
- 业务域：marketing、product、inventory 等
- 技术栈：Java、Dubbo、HTTP、静态前端等
- 主要接口 / 路由
- 上下游依赖
- 知识库状态
- 是否可作为实现应用
- 是否只作为测试或回归范围

## 数据来源

应用管理的数据可以来自：

- demo 配置文件。
- 仓库扫描结果。
- 手工维护的应用注册表。
- GitNexus 仓库索引。
- 知识库生成结果。

当前 demo 的核心数据位于：

```text
demo/ecom/spaces/knowledge/knowledge-base/registry/apps.json
```

## 运行链路

```text
应用管理列表
  -> 仓库扫描
  -> 应用能力识别
  -> 知识库生成
  -> MRD 影响面候选
  -> fanout-decision
  -> 应用分支流水线
```

## 与需求 PI 的关系

需求 PI 启动后，系统先读取应用管理列表，形成候选应用 manifest：

```text
MRD
  -> 应用管理候选应用
  -> global 知识库召回
  -> 应用级知识库验证
  -> 需求归属确认
  -> fanout-decision.json
```

应用管理只提供候选应用和基础事实，不直接决定最终进入实现分支。最终分流必须结合 MRD 和知识库证据。

## 与知识库的关系

知识库生成依赖应用管理：

- 仓库路径来自应用管理。
- 应用业务域来自应用管理。
- 生成后的知识库状态回写应用管理视图。
- 应用级知识库和全局知识库反过来增强后续影响面判断。

## 与 AI Ops 的关系

AI Ops 从应用管理选择告警所属应用，并读取该应用的：

- 业务域
- 技术栈
- 依赖关系
- 知识库路径
- GitNexus 索引状态

这些信息会参与告警影响面判断。

## 与 AI Testing 的关系

AI Testing 根据应用管理和 lifecycle deployment set 判断：

- 哪些应用需要部署 feature version。
- 哪些应用复用 stable version。
- 哪些应用进入跨应用测试范围。
- 哪些应用只进入回归范围。

## 与 GitNexus 的关系

应用管理告诉 GitNexus “有哪些仓库需要索引”。GitNexus 反过来补充：

- 仓库结构。
- 文件依赖。
- 接口入口。
- 调用关系。
- 代码级影响路径。

## 关键模块

```text
src/application/
src/application/applicationService.ts
src/application/managementTypes.ts
src/server/controllers/applicationController.ts
demo/ecom/spaces/knowledge/knowledge-base/registry/apps.json
```

## 截图

![应用管理](png/readme-app-management.png)
