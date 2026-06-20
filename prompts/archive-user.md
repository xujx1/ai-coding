## Task

Generate the current project's archive report and write it with the `write_file` tool.

## Current Project

- name: {{project_name}}
- root: {{project_root}}

## Inputs

### PRD

{{prd}}

### Project Tech Design

{{tech_design}}

### Development Spec

{{openspec_task}}

### Test Spec

{{openspec_test_task}}

### Changed Files

{{changed_files}}

### Review Report

{{review_report}}

### Test File List

{{test_file_list}}

### Unit Test Report

{{test_report}}

### Pipeline Execution Metrics

{{archive_execution_metrics}}

## Required Output

Use tools in this order:

1. Read the relevant project artifacts from `artifacts/`.
2. Inspect the project changed-file manifests and test report.
3. Write one Markdown archive report to `artifacts/{{project_name}}/archive-report.md`.

The archive report must include requirement summary, technical plan path, implementation changes, review result, test result, risks, residual work, delivery artifact references, and a `流水线执行指标` section.

The `流水线执行指标` section must include:

- Each node's execution duration.
- Tool call count and cumulative tool duration per node.
- Tool duration details grouped by node and tool name.
- Token usage per node and total token usage.
- Retry/failure count per node.

Do not return the full report as chat text. After writing the file, return a concise completion note.
