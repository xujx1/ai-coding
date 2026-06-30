## Task

Implement the current project's production Java changes.

## Current Project

- name: {{project_name}}
- root: {{project_root}}

## Upstream Inputs

### Clarified MRD

{{mrd_clarified}}

### Source Proposal / MRD

{{proposal}}

### Implementation Plan Manifest

{{implementation_manifest}}

### Spec Manifest

{{spec_manifest}}

### Project Tech Design

{{tech_design}}

### Development OpenSpec Task List

{{openspec_task}}

### OpenSpec Change Artifacts

{{openspec_change_context}}

### Test OpenSpec Task List

{{openspec_test_task}}

## Existing Project Context

{{project_context}}

## User Feedback

{{feedback}}

## Required Work

Use read/search tools first, then edit or write production code under this project only. Treat the OpenSpec change `tasks.md` development section as the execution checklist, and keep implementation aligned with `proposal.md`, `design.md`, and `spec.md`. Run `maven_compile` before finishing when the project is Maven based. Final response must summarize changed production files and verification result.

Do not stop after saying what you will do. This node is successful only if production files under `src/main` or `pom.xml` are actually changed and compilation is verified. If you believe no change is needed, prove it with tool reads and compilation; otherwise implement the requested behavior now.

Hard convergence rule: first tool round reads artifacts and locates candidate files; second tool round reads no more than 8 source/config/frontend files; third tool round must edit/write production files. Do not read `artifacts/prd.md`; use the MRD/proposal, generated tech design, OpenSpec `proposal.md`, `design.md`, `spec.md`, and `tasks.md` as the source of truth.
