## Task: {{node_name}}
{{node_description}}

## 用户反馈
{{feedback_text}}

## Implementation Plan Manifest
{{implementation_manifest_section}}

## Proposal / MRD
{{prd_section}}

## Clarified MRD Summary Source
{{clarified_mrd_section}}

## Project Manifest
```json
{{project_manifest_json}}
```

## Artifact Contract
只生成以下产物：
- `artifacts/{project}/openspec-task.md`
- `artifacts/{project}/openspec-test-task.md`
- `artifacts/spec-manifest.json` 由 orchestrator 写入

不要实现代码，不要生成 Java 测试代码，不要输出解释性前后缀。
