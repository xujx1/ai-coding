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
必须使用工具生成 `artifacts/{{project_name}}/openspec-test-task.md`：

1. 用 `read_file` 读取 `artifacts/mrd-clarified.md`、`artifacts/implementation-plan-manifest.json`、`artifacts/{{project_name}}/tech-design.md`、`artifacts/{{project_name}}/openspec-task.md`。
2. 用 `glob`/`grep`/`read_file` 检查当前项目中相关测试目录、被测生产类、Mock 依赖和 Maven 配置。
3. 用 `write_file` 写入 `artifacts/{{project_name}}/openspec-test-task.md`。
4. 最终回复只给一句完成摘要，不要重贴完整任务清单。

强制收敛规则：
- 第 1 轮工具调用必须一次性读取上述 artifacts，并最多补充 3 个 `glob`/`grep` 定位调用。
- 第 2 轮工具调用最多读取 8 个关键源码或测试文件；读完后必须调用 `write_file`。
- 不允许为了“再确认”“再核对”继续读取第三轮文件；若仍有细节不确定，使用技术方案、开发任务清单和已读文件生成可执行测试任务。
- 不要读取 `artifacts/prd.md`，本流程已取消 PRD，MRD/proposal 来源是 `artifacts/mrd-clarified.md`。

要求：
- 全文使用中文输出；代码标识符、接口路径、类名、方法名、字段名、枚举值和命令可以保留原文。
- 必须直接形成测试任务清单，不要说“我先读取 / 我将检查”。
- 只允许输出 `# ...测试任务清单` 和若干 `## Phase N: ...` 阶段。
- 每个 `## Phase` 阶段下面只输出 `- [ ] ...` checkbox 测试任务，不要输出说明段落。
- 不要输出 `测试范围`、`测试文件`、`单元测试用例`、`Mock / Stub 要求`、`断言要求`、`回归场景`、`Maven 命令要求` 这些说明型章节。
- 聚焦每个开发任务对应的测试文件、测试用例、Mock/Stub、断言、异常路径、回归覆盖和 Maven 命令。
- 每条任务尽量包含目标测试文件、被测生产类/方法、Mock 对象、断言点或 Maven 命令。
- 所有可执行测试任务必须使用 `- [ ] ...` checkbox 格式，不能用 `1.`/`2.` 编号任务。
- Pipeline 会将这份测试任务清单同步生成到 `artifacts/{{project_name}}/openspec/changes/.../tasks.md` 的 Test 部分，所以每条任务必须是 OpenSpec 可执行任务。
- 不要生成 Java 测试代码正文。

推荐结构：

# {{project_name}} 测试任务清单

## Phase 1: 测试结构与依赖梳理
- [ ] ...

## Phase 2: 单元测试用例生成
- [ ] ...

## Phase 3: Mock 与测试数据准备
- [ ] ...

## Phase 4: 异常路径与回归覆盖
- [ ] ...

## Phase 5: Maven 执行与报告校验
- [ ] ...
