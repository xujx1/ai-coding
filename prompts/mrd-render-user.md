## 任务：需求拆解

请使用工具读取 project-manifest 和需求文件，生成一份功能拆分与澄清清单。

重要：必须调用工具，不要只回复文本。

必须执行：
1. 使用 `read_file` 读取 `artifacts/project-manifest.json`。
2. 使用 `glob`/`read_file` 读取 `workspace/input` 下所有需求文本文件，或读取 manifest 中列出的绝对路径。
3. 使用 `write_file` 写入 `artifacts/mrd-clarified.md`。
4. 使用 `write_file` 写入 `artifacts/mrd-clarify-questions.md`。

{{previous_feedback_section}}

## 需求文件清单

这些文件也会在后文提供摘录，但你仍然必须用工具读取原始文件，便于执行轨迹可追溯：

{{requirement_file_list}}

## 需求文件内容摘录

以下是 orchestrator 预读取的需求文件内容摘录。它只作为兜底上下文，最终判断应基于你用工具读取到的文件内容。若摘录或文件内容不足以确认细节，请在 `Clarification Questions` 中记录。

{{requirement_excerpts}}

{{custom_prompt_section}}

## 项目清单

`artifacts/project-manifest.json` 已生成，包含以下项目：

{{project_list}}

## 输出要求

1. `artifacts/mrd-clarified.md` 第一行必须是 `# MRD Clarification`。
2. `artifacts/mrd-clarified.md` 必须包含 `## Feature Inventory`：把 MRD 拆成可实施功能点，优先输出 Markdown 表格，列为 `功能名 | 业务域 | 来源摘要 | 验收摘要`。功能点必须来自 MRD 的具体能力，不要写抽象分类。
3. `artifacts/mrd-clarified.md` 必须包含 `## Project Ownership`：把每个功能点路由到 manifest 中的项目文件夹，优先输出 Markdown 表格，列为 `功能项 | 主责项目 | 协作/消费项目 | 归属判断`。如果 MRD 区分设置端、管理端、用户端、运行侧、前端页面、后端接口，必须在归属判断中明确说明，例如“设置端页面由 marketing-admin 实现，用户运行侧命中判断由 marketing 提供”。如果 manifest 没有项目，写“未上传代码项目”，并给出从需求内容推断出的业务系统名。
4. `artifacts/mrd-clarified.md` 必须包含 `## Implementation Surfaces`：输出 Markdown 表格，列为 `功能项 | 项目 | frontend | backend | contract | e2e | 判断依据`。每个布尔列只写 `yes`、`no` 或 `unknown`。这张表用于 planner 判断是否生成前端、后端、契约和 E2E 子流程。
5. `artifacts/mrd-clarified.md` 必须包含 `## Implementation Boundaries`：说明功能归属、跨系统边界、项目只消费不实现的能力，优先输出 Markdown 表格，列为 `项目 | 需要实现 | 只消费/不实现 | 边界说明`。
6. `artifacts/mrd-clarified.md` 必须包含 `## Clarification Questions`：最多 3 个真正阻断后续实施的问题，只问会影响功能归属、业务边界、字段/接口口径、验收口径的问题，不问代码实现方案；如果可以采用保守默认判断，就不要提问。
7. `artifacts/mrd-clarified.md` 必须包含 `## Clarified Decisions`：列出可默认采用的业务假设和已确认边界，用来承接非阻断不确定项。
8. `artifacts/mrd-clarify-questions.md` 第一行必须是 `# MRD Clarify Questions`，只保留待用户确认的问题；如果无阻断问题，写“无需澄清。”
9. 最终回复只给一句完成摘要，不要输出 MRD 原文全文、source map JSON、工具调用说明或解释性废话。

## 目录信息

- 运行目录: {{run_dir}}
- 输入目录: {{input_dir}}
- 产物目录: {{artifacts_dir}}
