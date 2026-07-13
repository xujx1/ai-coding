## 任务：需求应用归属确认

请使用工具读取 project-manifest、需求文件和知识库证据，生成一份功能拆分、应用归属与澄清清单。

重要：必须调用工具，不要只回复文本。

必须执行：
1. 使用 `read_file` 读取 `artifacts/project-manifest.json`。
2. 使用 `glob`/`read_file` 读取 `input` 下所有需求文本文件，或读取 manifest 中列出的绝对路径。
3. 使用 `glob`/`grep`/`read_file` 检查候选应用下的 `knowledge/`、`docs/`、`src/` 中和 MRD 关键词相关的证据，至少覆盖 global 知识库召回结果中 score 最高的应用。
4. 使用 `write_file` 写入 `artifacts/mrd-clarified.md`。
5. 使用 `write_file` 写入 `artifacts/mrd-clarify-questions.md`。

{{previous_feedback_section}}

## 需求文件清单

这些文件也会在后文提供摘录，但你仍然必须用工具读取原始文件，便于执行轨迹可追溯：

{{requirement_file_list}}

## 需求文件内容摘录

以下是 orchestrator 预读取的需求文件内容摘录。它只作为兜底上下文，最终判断应基于你用工具读取到的文件内容。若摘录或文件内容不足以确认细节，请在 `Clarification Questions` 中记录。

{{requirement_excerpts}}

{{custom_prompt_section}}

## 知识库归属证据

以下是 orchestrator 根据 MRD + global 知识库 + 应用级知识库做的预召回结果。它不是最终答案，你必须用工具读取/grep 相关文件做可观测验证，然后再输出应用归属。

{{knowledge_context}}

## 应用管理候选应用清单

`artifacts/project-manifest.json` 已生成，包含以下应用管理候选应用：

{{project_list}}

## 输出要求

1. `artifacts/mrd-clarified.md` 第一行必须是 `# MRD Clarification`。
2. `artifacts/mrd-clarified.md` 必须包含 `## Feature Inventory`：把 MRD 拆成可实施功能点，优先输出 Markdown 表格，列为 `功能名 | 业务域 | 来源摘要 | 验收摘要`。功能点必须来自 MRD 的具体能力，不要写抽象分类。
3. `artifacts/mrd-clarified.md` 必须包含 `## Project Ownership`：把每个功能点路由到 manifest 中的应用管理候选应用，优先输出 Markdown 表格，列为 `功能项 | 主责项目 | 协作/消费项目 | 归属判断`。如果 MRD 区分设置端、管理端、用户端、运行侧、前端页面、后端接口，必须在归属判断中明确说明。manifest 有项目时禁止写“未上传代码项目”；manifest 没有项目时才写“未匹配到应用管理候选应用”。
4. `artifacts/mrd-clarified.md` 必须包含 `## Implementation Surfaces`：输出 Markdown 表格，列为 `功能项 | 项目 | frontend | backend | contract | e2e | 判断依据`。每个布尔列只写 `yes`、`no` 或 `unknown`。这张表用于 planner 判断是否生成前端、后端、契约和 E2E 子流程。
5. `artifacts/mrd-clarified.md` 必须包含 `## Implementation Boundaries`：说明功能归属、跨系统边界、项目只消费不实现的能力，优先输出 Markdown 表格，列为 `项目 | 需要实现 | 只消费/不实现 | 边界说明`。
6. `artifacts/mrd-clarified.md` 必须包含 `## Clarification Questions`：最多 3 个真正阻断后续实施的问题，只问会影响功能归属、业务边界、字段/接口口径、验收口径的问题，不问代码实现方案；如果可以采用保守默认判断，就不要提问。
7. `artifacts/mrd-clarified.md` 必须包含 `## Clarified Decisions`：列出可默认采用的业务假设和已确认边界，用来承接非阻断不确定项。
8. `artifacts/mrd-clarify-questions.md` 第一行必须是 `# MRD Clarify Questions`，只保留待用户确认的问题；如果无阻断问题，写“无需澄清。”
9. 最终回复只给一句完成摘要，不要输出 MRD 原文全文、source map JSON、工具调用说明或解释性废话。

## 归属判断规则

- 先按 MRD + global 知识库召回候选应用，再用应用级知识库和代码/接口证据验证。
- 禁止使用写死的业务域到应用名映射；应用名必须来自 `artifacts/project-manifest.json`，归属依据必须来自知识库召回、应用级知识库、docs、src 或 API/路由证据。
- 如果 MRD 提到某条下游链路但同时说明不改变该链路，或知识库证据只表明它是消费/回归范围，不要把它作为实现应用；只放入跨应用测试或回归范围。
- 如果某个业务名无法映射到 manifest 中的真实应用，把它放入 `Clarification Questions` 或 `Implementation Boundaries` 的未解析项，不要写“未上传代码项目”。

## 目录信息

- 运行目录: {{run_dir}}
- 输入目录: {{input_dir}}
- 产物目录: {{artifacts_dir}}
