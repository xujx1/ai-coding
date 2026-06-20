## Task

Implement the current project's production Java changes.

## Current Project

- name: {{project_name}}
- root: {{project_root}}

## Upstream Inputs

### Clarified MRD

{{mrd_clarified}}

### PRD

{{prd}}

### Implementation Plan Manifest

{{implementation_manifest}}

### Spec Manifest

{{spec_manifest}}

### Project Tech Design

{{tech_design}}

### Development OpenSpec Task List

{{openspec_task}}

### Test OpenSpec Task List

{{openspec_test_task}}

## Existing Project Context

{{project_context}}

## User Feedback

{{feedback}}

## Required Work

Use read/search tools first, then edit or write production code under this project only. Run `maven_compile` before finishing when the project is Maven based. Final response must summarize changed production files and verification result.

Do not stop after saying what you will do. This node is successful only if production files under `src/main` or `pom.xml` are actually changed and compilation is verified. If you believe no change is needed, prove it with tool reads and compilation; otherwise implement the requested behavior now.
