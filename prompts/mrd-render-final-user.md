## 任务：生成最终需求拆解清单

你将收到第一轮需求拆解草案、已抽取的问题清单，以及用户对问题清单的确认/回答。

请把用户回答合并进最终文档，并使用 `write_file` 覆盖写入 `artifacts/mrd-clarified.md`。

不要只回复 Markdown 文本；必须调用 `write_file`。最终回复只给一句完成摘要。

## 第一轮需求拆解草案

```markdown
{{draft}}
```

## 问题清单

```markdown
{{questions}}
```

## 用户确认/回答

```text
{{answers}}
```

## 输出要求

1. 写入 `artifacts/mrd-clarified.md` 的内容第一行必须是 `# MRD Clarification`。
2. 必须包含 `## Feature Inventory`、`## Project Ownership`、`## Implementation Surfaces`、`## Implementation Boundaries`、`## Clarification Questions`、`## Clarified Decisions`。
3. `## Clarification Questions` 中保留仍未解决的问题；如果用户已经明确回答，移到 `## Clarified Decisions`。
4. `## Clarified Decisions` 必须包含用户确认/回答带来的最终口径。
5. 输出的是功能拆分、项目归属、边界和澄清结果，不要重贴需求原文全文。
