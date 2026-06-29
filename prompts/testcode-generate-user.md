## Task

Generate or update unit test code for the current project.

## Current Project

- name: {{project_name}}
- root: {{project_root}}

## Upstream Inputs

### PRD

{{prd}}

### Test OpenSpec Task List

{{openspec_test_task}}

### OpenSpec Change Artifacts

{{openspec_change_context}}

### Production Changed Files

{{changed_files}}

### Code Preview Manifest

{{code_preview_manifest}}

### Review Report

{{review_report}}

### Review Findings

{{review_findings}}

## Existing Project Context

{{project_context}}

## User Feedback

{{feedback}}

## Required Work

Use read/search tools to locate real classes and test patterns. Treat the OpenSpec change `tasks.md` test section as the execution checklist, and keep tests aligned with `proposal.md`, `design.md`, and `spec.md`. Write tests under `src/test/java` for this project only. Prefer JUnit 5 and Mockito when the project supports them. Run `maven_compile` before finishing when Maven is available. Final response must list test files changed and verification result.
