{{base_context}}

## 输出要求
必须使用工具生成 `artifacts/prd.md`：

1. 用 `read_file` 读取 `artifacts/mrd-clarified.md`、`artifacts/mrd-clarify-questions.md`、`artifacts/project-manifest.json`。
2. 如果存在 `artifacts/implementation-boundaries.md`，也用 `read_file` 读取。
3. 用 `write_file` 写入 `artifacts/prd.md`。
4. 最终回复只给一句完成摘要，不要重贴完整 PRD。

要求：
- 产品视角，避免实现类名和代码细节。
- 覆盖背景与目标、用户与场景、功能范围、不在本次范围、业务规则、验收标准、待确认但不阻塞事项。
- 必须使用下面的固定章节顺序和 Markdown 格式：
  - `# PRD / 验收口径`
  - `## 1. 背景与目标`
  - `## 2. 用户与场景`
  - `## 3. 功能范围`
  - `## 4. 不在本次范围`
  - `## 5. 业务规则`
  - `## 6. 验收标准`
  - `## 7. 待确认但不阻塞事项`
- 每个章节下面优先使用 `- ...` 列表；不要把多条规则压成一个长段落。
- 不要输出解释性前后缀。
