## Task

Execute the current project's generated unit tests and classify the result.

## Current Project

- name: {{project_name}}
- root: {{project_root}}

## Inputs

### Test File List

{{test_file_list}}

### Changed Production Files

{{changed_files}}

### Review Report

{{review_report}}

### Existing Test Report

{{test_report}}

## Existing Project Context

{{project_context}}

## User Feedback

{{feedback}}

## Required Work

Read the test file list, then call `maven_test` from the project root. Do not edit files in this node. Final response must include executed tests, Maven result summary, failure category, and report paths.
