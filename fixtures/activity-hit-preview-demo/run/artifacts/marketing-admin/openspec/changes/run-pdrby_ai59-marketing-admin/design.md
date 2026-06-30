# marketing-admin Design Notes

## Context
marketingadmin 技术方案 1. 项目根目录 项目根目录：/Users/xu/IdeaProjects/aicoding/runtimeprojects/runs/PDRbYAI59/workspace/project/marketingadmin 技术形态：单 Maven 模块 Spring Boot 2.7 应用，后端接口与静态前端同仓。 现有前端入口位于 src/main/resources/static/，当前首页由 [src/main/resources/static/index.html](/Users/xu/IdeaProjects/aicoding/runtimeprojects/runs/PDRbYAI59/workspace/project/marketingadmin/src/main/resources/static/index.html:1)、[src/main/resources/static/app.js](/Users/xu/IdeaProjects/aicoding/runtimeprojects/runs/PDRbYAI59/workspace/project/marketingadmin/src/main/resources/static/app.js:1)、[src/main/resources/static/styles.css](/Users/xu/IdeaProjects/aicoding/runtimeprojects/runs/PDRbYAI59/workspace/project/marketingadmin/src/main/resources/static/styles.css:1) 组成。 现有后端主干包结构已具备 api、application、infrastructure、web 四层，适合按现有分层...

## Execution Model
- `spec-generate` creates this OpenSpec change from project-scoped task artifacts.
- `java-impl` consumes development tasks and marks development checkboxes complete after code changes.
- `testcode-generate` consumes test tasks and marks test checkboxes complete after test generation and Maven execution.

## Node Contracts
- Dynamic execution nodes use the registered planner node contracts for required inputs, produced artifacts, and task completion updates.