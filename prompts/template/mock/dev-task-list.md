## Phase 1: 代码结构与现状梳理
- [ ] 阅读 PRD、技术方案和项目结构，确认 Controller、Service、Mapper 和 DTO 改动点。
- [ ] 使用 `glob`、`grep`、`read_file` 定位现有同类实现。

## Phase 2: 接口与入参实现
- [ ] 新增或修改请求 DTO，补齐字段和校验规则。
- [ ] 在 Controller 中新增接口入口并保持统一返回结构。

## Phase 3: 业务逻辑实现
- [ ] 在 Service 中实现参数校验、业务规则、幂等和审计流程。
- [ ] 补齐错误码、异常映射和日志记录。

## Phase 4: 数据访问与配置实现
- [ ] 在 Mapper 或 Repository 中新增查询与更新方法。
- [ ] 按项目风格补齐 XML、配置或 SQL 变更。

## Phase 5: 编译验证与验收自查
- [ ] 运行 Maven 编译命令并修复编译错误。
- [ ] 对照 PRD 验收点检查实现完整性。
