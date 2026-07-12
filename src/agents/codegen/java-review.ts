export function buildReviewFindings(projectName: string, report: string): {
  project: string;
  result: 'PASS' | 'WARN' | 'BLOCK';
  blockers: Array<{ file: string; reason: string; routeTo: string }>;
  warnings: Array<{ file: string; reason: string }>;
} {
  const upper = report.toUpperCase();
  const explicitResult = report.match(/结果\s*[:：]\s*`?(PASS|WARN|BLOCK)`?/i)?.[1]?.toUpperCase();
  const result = explicitResult === 'PASS' || explicitResult === 'WARN' || explicitResult === 'BLOCK'
    ? explicitResult
    : upper.includes('BLOCK') || /必须修复|回退节点\s*[:：]\s*`?java-impl`?/i.test(report)
      ? 'BLOCK'
      : upper.includes('WARN') || /警告问题数量\s*[:：]\s*[1-9]/.test(report)
        ? 'WARN'
        : 'PASS';
  return {
    project: projectName,
    result,
    blockers: result === 'BLOCK'
      ? [{ file: '见 code-review.md', reason: '评审报告包含 BLOCK 结论', routeTo: 'java-impl' }]
      : [],
    warnings: result === 'WARN'
      ? [{ file: '见 code-review.md', reason: '评审报告包含 WARN 结论' }]
      : [],
  };
}
