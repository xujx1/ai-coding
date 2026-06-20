{{base_context}}

## 当前项目
- projectName: {{project_name}}
- projectRoot: {{project_root}}

## 已读取项目上下文
{{project_context}}

## 输出要求
必须使用工具生成 `artifacts/{{project_name}}/tech-design.md`：

1. 用 `read_file` 读取 `artifacts/mrd-clarified.md`、`artifacts/prd.md`、`artifacts/project-manifest.json`。
2. 用 `glob`/`grep`/`read_file` 检查当前项目结构和关键代码文件。
3. 用 `write_file` 写入 `artifacts/{{project_name}}/tech-design.md`。
4. 最终回复只给一句完成摘要，不要重贴完整技术方案。

要求：
- 必须基于上面的项目结构和代码摘录直接形成方案。
- 不要说“我先检查 / 我将读取 / 当前任务是”。
- 覆盖影响范围、改动文件候选、接口/数据/配置影响、实施步骤、测试策略、风险与回滚。
- 必须使用下面的固定章节顺序和 Markdown 格式：
  - `# {{project_name}} 技术方案`
  - `## 1. 项目根目录`
  - `## 2. 影响范围`
  - `## 3. 主要改动文件候选`
  - `## 4. 接口 / 数据 / 配置影响`
  - `## 5. 实施步骤`
  - `## 6. 测试策略`
  - `## 7. 风险与回滚`
- 每个章节下面优先使用 `- ...` 列表；实施步骤可以使用短编号列表。
- 不要把多个章节内容压成一个长段落。
- 只输出当前项目内容，不要输出其它项目内容。
