{{base_context}}

## 当前项目
- projectName: {{project_name}}
- projectRoot: {{project_root}}

## 当前项目技术方案
- path: artifacts/{{project_name}}/tech-design.md

{{tech_design}}

## 当前项目代码上下文
{{project_context}}

## 子任务要求
必须使用工具生成 `artifacts/{{project_name}}/openspec-task.md`：

1. 用 `read_file` 读取 `artifacts/mrd-clarified.md`、`artifacts/implementation-plan-manifest.json`、`artifacts/{{project_name}}/tech-design.md`。
2. 用 `glob`/`grep`/`read_file` 检查当前项目中相关 Controller、Service、Mapper、DTO、测试目录或配置文件。
3. 用 `write_file` 写入 `artifacts/{{project_name}}/openspec-task.md`。
4. 最终回复只给一句完成摘要，不要重贴完整任务清单。

要求：
- 全文使用中文输出；代码标识符、接口路径、类名、方法名、字段名、枚举值和命令可以保留原文。
- 必须直接形成开发任务清单，不要说“我先读取 / 我将检查”。
- 只允许输出 `# ...开发任务清单` 和若干 `## Phase N: ...` 阶段。
- 每个 `## Phase` 阶段下面只输出 `- [ ] ...` checkbox 任务，不要输出说明段落。
- 不要输出 `变更摘要`、`影响模块`、`开发任务`、`接口任务`、`数据与配置任务`、`兼容与迁移任务`、`验收清单`、`回滚说明` 这些说明型章节。
- 任务必须能被 Java 实现节点逐条执行，优先写成“修改/新增/校验/运行”的动作句。
- 每条任务尽量包含目标文件、类名、方法名、接口路径、SQL/Mapper 或 Maven 命令。
- 不能用 `1.`/`2.` 编号任务。
- 后续 Java 实现节点会在这份文件上把完成项从 `[ ]` 改为 `[x]`，所以不要省略 checkbox。
- Pipeline 会将这份任务清单同步生成到 `artifacts/{{project_name}}/openspec/changes/.../tasks.md` 的 Development 部分，所以每条任务必须是 OpenSpec 可执行任务。
- 不要输出测试代码。

推荐结构：

# {{project_name}} 开发任务清单

## Phase 1: 代码结构与现状梳理
- [ ] ...

## Phase 2: 接口与入参实现
- [ ] ...

## Phase 3: 业务逻辑实现
- [ ] ...

## Phase 4: 数据访问与配置实现
- [ ] ...

## Phase 5: 编译验证与验收自查
- [ ] ...
