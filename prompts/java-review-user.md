## Task

Review the current project's implemented Java changes.

## Current Project

- name: {{project_name}}
- root: {{project_root}}
- artifactsDir: {{artifacts_dir}}

## Artifact Paths

Use these absolute paths with Read/Glob/Grep tools. Do not resolve `artifacts/...` under the project root.

- changed files manifest: `{{changed_files_manifest_path}}`
- code preview manifest: `{{code_preview_manifest_path}}`
- changed file preview directory: `{{changed_files_preview_dir}}`

## Upstream Inputs

### PRD

{{prd}}

### Project Tech Design

{{tech_design}}

### Development OpenSpec Task List

{{openspec_task}}

### Changed Files Manifest

{{changed_files}}

### Code Preview Manifest

{{code_preview_manifest}}

When a manifest entry contains a relative path such as `artifacts/{{project_name}}/changed-files/Foo.java`, read it from:

`{{artifacts_dir}}/{{project_name}}/changed-files/Foo.java`

## Existing Project Context

{{project_context}}

## Required Output

Return one Chinese Markdown review report only.

要求：
- 全文使用中文；代码标识符、文件路径、类名、方法名、字段名和 `PASS`/`WARN`/`BLOCK` 可以保留原文。
- 必须先读取 changed files manifest 和 code preview manifest，再读取实际变更文件预览。
- 如果 manifest 或预览路径不存在，使用 Glob/Grep 在 `{{artifacts_dir}}` 和 `{{project_root}}` 下查找同名文件；不要因为一个猜测路径不存在就输出 BLOCK。
- 只评审本次变更文件，不扩展到未改动代码。
- 报告必须包含明确的 `结果：PASS`、`结果：WARN` 或 `结果：BLOCK`。
- 有阻断问题时，每个阻断项必须写明文件、问题、影响、修复建议和回退节点 `java-impl`。
