## Task: {{node_name}}
{{node_description}}

## 用户反馈
{{feedback_text}}

## Clarified MRD
{{clarified_mrd_section}}

## Confirmed Implementation Boundaries
{{boundary_source_note}}

{{boundaries_section}}

## User Custom Prompt
{{custom_prompt_section}}

## Project Manifest
```json
{{project_manifest_json}}
```

## Project Workspace
- workspace/project: {{project_dir}}
- artifacts: {{artifacts_dir}}

项目技术方案子 Agent 可以使用预读取的项目上下文和必要的只读工具理解代码结构，但最终只输出 Markdown 正文，由 orchestrator 写入 artifacts。
