## 任务：澄清 MRD

你将收到 artifacts/mrd.md 的完整内容。请直接输出澄清结果 Markdown，不要回复行动计划，不要说“我先读取/核对”。

{{feedback_section}}

## 项目清单
{{project_list}}

## 用户自定义 Prompt
{{custom_prompt_section}}

## artifacts/mrd.md
```markdown
{{mrd_content}}
```

## 输出要求
1. 最终回复必须是 Markdown，第一行必须是 `# MRD Clarification`。
2. 必须包含 `## Feature Inventory`：把 MRD 中的功能拆成可实施功能点，至少包含功能名、业务域、输入来源、验收口径摘要。
3. 必须包含 `## Project Ownership`：用表格把每个功能点路由到 manifest 中的项目文件夹；表格列必须包含「需求项」「负责应用/项目」「协作应用」「实现职责」「证据/原因」。如果 manifest 没有项目，写“未上传代码项目”，并给出从 MRD 推断出的业务系统名。
4. 必须包含 `## Implementation Boundaries`：用表格说明哪些需求属于哪个项目/系统、哪些是跨系统接口、哪些项目只是消费/透传/日志记录、哪些项目不改代码；表格列必须包含「需求项」「应用/项目」「边界类型」「需要改代码」「产物/接口」「待用户确认点」。
5. 必须包含 `## Clarification Questions`：只问会影响功能归属、项目边界、字段口径、接口边界、验收口径的问题；不要问具体代码实现方案。
6. 必须包含 `## Clarified Decisions`：列出可默认采用的业务假设和已确认边界。不要整篇重贴 MRD 原文。
7. 不要输出工具调用说明、文件写入说明、JSON 或解释性废话。
