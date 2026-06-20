# 测试报告

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 项目名称 | {{project_name}} |
| 需求名称 | {{requirement_name}} |
| 测试分支 | {{test_branch}} |
| 测试日期 | {{test_date}} |
| 测试文件清单 | artifacts/{{project_name}}/test-file-list.md |
| 变更清单 | artifacts/{{project_name}}/changed-files.json |

---

## 2. 执行摘要

| 指标 | 数值 |
|------|------|
| 测试类数量 | {{test_class_count}} |
| 测试用例总数 | {{tests_run}} |
| 通过（PASS） | {{passed}} |
| 失败（FAIL） | {{failures}} |
| 错误（ERROR） | {{errors}} |
| 跳过（SKIP） | {{skipped}} |
| 通过率 | {{pass_rate}} |
| 总耗时 | {{total_time}} |
| Maven 次数 | {{maven_runs}} |
| 根因分类 | `{{category}}` |
| `mvn test` 退出码 | {{exit_code}} |
| 权限兜底 | {{permission_fallback}} |
| Surefire 命令行覆盖 | not-needed |

### 2.1 时延拆分

| 步骤 | 耗时 | 备注 |
|------|------|------|
| `mvn test` | {{maven_test_time}} | 由 maven_test 工具真实执行 |
| `jacoco:report` | {{jacoco_report_status}} | {{jacoco_report_note}} |
| 增量脚本 | 未执行 | 当前节点未启用精确增量覆盖率 |
| 覆盖率脚本模式 | not-enabled | |

---

## 3. 覆盖率

### 3.1 全量覆盖率（仅供参考）

| 维度 | 覆盖率 |
|------|--------|
| 行覆盖率 | {{line_coverage}} |
| 分支覆盖率 | {{branch_coverage}} |
| 方法覆盖率 | {{method_coverage}} |
| 类覆盖率 | {{class_coverage}} |

### 3.2 精确增量覆盖率

| 维度 | 实际覆盖率 | 目标值 | 是否达标 |
|------|------------|--------|----------|
| 增量行覆盖率 | {{incremental_line_coverage}} | ≥ 80% | {{incremental_line_status}} |
| 增量分支覆盖率 | {{incremental_branch_coverage}} | 参考 | {{incremental_branch_status}} |

### 3.3 覆盖率诊断摘要

| 项 | 内容 |
|----|------|
| 覆盖率脚本首轮结果 | {{coverage_first_result}} |
| 是否触发兜底 | {{coverage_fallback_triggered}} |
| 兜底动作 | {{coverage_fallback_action}} |
| 最终覆盖率口径 | {{coverage_final_scope}} |

---

## 4. 失败与阻塞分类

| 类型 | 说明 | 结论 |
|------|------|------|
| `runner_asset_failure` | Runner、命令、环境或权限问题 | {{runner_asset_conclusion}} |
| `compile_failure` | 测试编译失败 / 依赖缺失 / 执行前失败 | {{compile_conclusion}} |
| `test_failure` | 断言失败 / ERROR / 启动失败 | {{test_failure_conclusion}} |
| `coverage_below_threshold` | 用例全绿但精确增量覆盖率不足 | 未判定 |

---

## 5. 用例明细

### 5.1 失败用例

| # | 用例名称 | 所属测试类 | 关联测试任务 | 摘要 |
|---|----------|------------|--------------|------|
| 1 | {{failed_case_name}} | {{failed_case_class}} | 未采集 | {{failed_case_summary}} |

### 5.2 跳过用例

| # | 用例名称 | 原因 |
|---|----------|------|
| 1 | {{skipped_case_name}} | {{skipped_case_reason}} |

### 5.3 关键异常摘要

| # | 类型 | 摘要 |
|---|------|------|
| 1 | {{exception_type}} | {{exception_summary}} |

---

## 6. 未覆盖分析

| 文件/方法 | 未覆盖原因 | 建议 |
|-----------|-----------|------|
| 未采集 | 当前节点未执行覆盖率分析 | 后续可接入 JaCoCo 增量覆盖率 |

---

## 7. 结论

**结论**：{{final_conclusion}}

**报告路径**：artifacts/{{project_name}}/test-report.md

**建议回流链**：{{feedback_route}}

**下一步注意事项**：{{next_note}}

## Maven 输出摘要

```text
{{maven_output}}
```

{{truncation_note}}
