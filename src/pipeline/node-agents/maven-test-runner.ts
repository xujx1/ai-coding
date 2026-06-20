import * as fs from 'fs';
import * as path from 'path';

export type MavenFailureCategory =
  | 'success'
  | 'compile_failure'
  | 'test_failure'
  | 'coverage_below_threshold'
  | 'runner_asset_failure';

export interface MavenClassification {
  category: MavenFailureCategory;
  reason: string;
}

export interface SurefireSummary {
  testsRun: number;
  failures: number;
  errors: number;
  skipped: number;
  testClassCount?: number;
  totalTimeSeconds?: number;
}

export interface MavenTestArtifactEntries {
  entries: Record<string, string>;
  classification: MavenClassification;
  surefire: SurefireSummary;
}

export function buildMavenTestArtifactEntries(projectName: string, mavenOutput: string, projectRoot?: string): MavenTestArtifactEntries {
  const classification = classifyMavenOutput(mavenOutput);
  const surefire = summarizeSurefireOutput(mavenOutput, projectRoot);
  const coverage = summarizeCoverage(projectRoot);
  const failedTotal = surefire.failures + surefire.errors;
  const passed = Math.max(0, surefire.testsRun - failedTotal - surefire.skipped);
  const passRate = surefire.testsRun > 0 ? `${Math.round((passed / surefire.testsRun) * 10000) / 100}%` : '未采集';
  const exitCode = mavenOutput.match(/\[exit code:\s*([^\]]+)\]/)?.[1] ?? (classification.category === 'success' ? '0' : '非 0 或未采集');
  const mavenRuns = Math.max(1, (mavenOutput.match(/\$\s+.*mvn\s+test/g) || []).length);
  const totalTime = surefire.totalTimeSeconds !== undefined
    ? `${Math.round(surefire.totalTimeSeconds * 1000) / 1000}s`
    : '未采集';

  const report = renderTemplate(loadTemplate('test-report.md'), {
    project_name: projectName,
    requirement_name: '当前流水线需求',
    test_branch: '未采集（运行目录非 Git 工作区或未读取分支）',
    test_date: new Date().toISOString(),
    category: classification.category,
    test_class_count: String(surefire.testClassCount ?? '未采集'),
    tests_run: String(surefire.testsRun),
    passed: String(passed),
    failures: String(surefire.failures),
    errors: String(surefire.errors),
    skipped: String(surefire.skipped),
    pass_rate: passRate,
    total_time: totalTime,
    maven_test_time: totalTime,
    maven_runs: String(mavenRuns),
    exit_code: exitCode,
    permission_fallback: 'not-needed',
    jacoco_report_status: coverage.available ? '已解析' : '未执行',
    jacoco_report_note: coverage.available ? '已读取 target/site/jacoco/jacoco.xml' : coverage.note,
    line_coverage: coverage.lineCoverage ?? '未采集（未检测到 JaCoCo XML）',
    branch_coverage: coverage.branchCoverage ?? '未采集（未检测到 JaCoCo XML）',
    method_coverage: coverage.methodCoverage ?? '未采集（未检测到 JaCoCo XML）',
    class_coverage: coverage.classCoverage ?? '未采集（未检测到 JaCoCo XML）',
    incremental_line_coverage: coverage.available ? '未执行增量覆盖率脚本' : '未采集',
    incremental_line_status: '未判定',
    incremental_branch_coverage: coverage.available ? '未执行增量覆盖率脚本' : '未采集',
    incremental_branch_status: '未判定',
    coverage_first_result: coverage.available ? '已解析全量 JaCoCo XML；未执行增量脚本' : '未执行，项目未生成 JaCoCo XML',
    coverage_fallback_triggered: '否',
    coverage_fallback_action: '无',
    coverage_final_scope: coverage.available ? '全量 JaCoCo 覆盖率 + Maven 单元测试结果' : 'Maven 单元测试结果；项目未配置或未生成 JaCoCo 覆盖率报告',
    runner_asset_conclusion: classification.category === 'runner_asset_failure' ? '中断' : '继续',
    compile_conclusion: classification.category === 'compile_failure' ? '中断' : '继续',
    test_failure_conclusion: classification.category === 'test_failure' ? '中断' : '继续',
    failed_case_name: failedTotal ? '详见 Maven 输出摘要' : '无',
    failed_case_class: failedTotal ? '详见 Surefire 报告' : '无',
    failed_case_summary: failedTotal ? classification.reason : '无失败用例',
    skipped_case_name: surefire.skipped ? '详见 Surefire 报告' : '无',
    skipped_case_reason: surefire.skipped ? '详见 Maven 输出摘要' : '无跳过用例',
    exception_type: classification.category === 'success' ? '无' : classification.category,
    exception_summary: classification.category === 'success' ? '无关键异常' : classification.reason,
    final_conclusion: classification.category === 'success'
      ? 'mvn test 执行成功，未发现失败用例。'
      : `mvn test 未通过，分类为 ${classification.category}：${classification.reason}`,
    feedback_route: classification.category === 'success' ? '进入归档或后续交付检查。' : '回流到 Java 实现或测试代码节点修复后重跑。',
    next_note: classification.category === 'success' ? '如需覆盖率门禁，可启用 JaCoCo 增量覆盖率。' : '优先查看 Maven 输出摘要和 surefire-reports。',
    maven_output: mavenOutput.slice(0, 12000),
    truncation_note: mavenOutput.length > 12000 ? '...（已截断）' : '',
  });

  const autofix = renderTemplate(loadTemplate('autofix-history.md'), {
    project_name: projectName,
  });
  const coverageSummary = {
    project: projectName,
    ...coverage,
  };
  const entries = {
    [`${projectName}/test-report.md`]: report,
    [`${projectName}/surefire-summary.json`]: JSON.stringify({ project: projectName, ...surefire }, null, 2),
    [`${projectName}/coverage-summary.json`]: JSON.stringify(coverageSummary, null, 2),
    [`${projectName}/failure-classification.json`]: JSON.stringify({ project: projectName, ...classification }, null, 2),
    [`${projectName}/autofix-history.md`]: autofix,
  };
  return { entries, classification, surefire };
}

export function summarizeSurefireOutput(output: string, projectRoot?: string): SurefireSummary {
  const fromReports = summarizeSurefireReports(projectRoot);
  if (fromReports) return fromReports;

  const matches = [...output.matchAll(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/g)];
  if (!matches.length) {
    return { testsRun: 0, failures: 0, errors: 0, skipped: 0 };
  }
  return matches.reduce((acc, match) => ({
    testsRun: acc.testsRun + Number(match[1] || 0),
    failures: acc.failures + Number(match[2] || 0),
    errors: acc.errors + Number(match[3] || 0),
    skipped: acc.skipped + Number(match[4] || 0),
  }), { testsRun: 0, failures: 0, errors: 0, skipped: 0 });
}

function summarizeSurefireReports(projectRoot?: string): SurefireSummary | null {
  if (!projectRoot) return null;
  const reportDir = path.join(projectRoot, 'target', 'surefire-reports');
  if (!fs.existsSync(reportDir)) return null;
  const xmlFiles = fs.readdirSync(reportDir).filter(file => /^TEST-.*\.xml$/.test(file));
  if (!xmlFiles.length) return null;

  const summary = xmlFiles.reduce((acc, file) => {
    const xml = fs.readFileSync(path.join(reportDir, file), 'utf-8');
    const testsuite = xml.match(/<testsuite\b([^>]*)>/);
    const attrs = testsuite ? parseXmlAttributes(testsuite[1]) : {};
    return {
      testsRun: acc.testsRun + Number(attrs.tests ?? 0),
      failures: acc.failures + Number(attrs.failures ?? 0),
      errors: acc.errors + Number(attrs.errors ?? 0),
      skipped: acc.skipped + Number(attrs.skipped ?? 0),
      testClassCount: (acc.testClassCount ?? 0) + 1,
      totalTimeSeconds: (acc.totalTimeSeconds ?? 0) + Number(attrs.time ?? 0),
    };
  }, { testsRun: 0, failures: 0, errors: 0, skipped: 0, testClassCount: 0, totalTimeSeconds: 0 } as SurefireSummary);

  return summary;
}

interface CoverageSummary {
  available: boolean;
  lineCoverage: string | null;
  branchCoverage: string | null;
  methodCoverage: string | null;
  classCoverage: string | null;
  note: string;
}

function summarizeCoverage(projectRoot?: string): CoverageSummary {
  const unavailable: CoverageSummary = {
    available: false,
    lineCoverage: null,
    branchCoverage: null,
    methodCoverage: null,
    classCoverage: null,
    note: '未检测到 target/site/jacoco/jacoco.xml；当前 Maven 测试未生成覆盖率报告。',
  };
  if (!projectRoot) return unavailable;
  const jacocoXml = path.join(projectRoot, 'target', 'site', 'jacoco', 'jacoco.xml');
  if (!fs.existsSync(jacocoXml)) return unavailable;
  const xml = fs.readFileSync(jacocoXml, 'utf-8');
  const counterRegex = /<counter\s+type="([^"]+)"\s+missed="(\d+)"\s+covered="(\d+)"\s*\/>/g;
  const counters = new Map<string, { missed: number; covered: number }>();
  for (const match of xml.matchAll(counterRegex)) {
    counters.set(match[1], { missed: Number(match[2]), covered: Number(match[3]) });
  }
  return {
    available: true,
    lineCoverage: formatCoverage(counters.get('LINE')),
    branchCoverage: formatCoverage(counters.get('BRANCH')),
    methodCoverage: formatCoverage(counters.get('METHOD')),
    classCoverage: formatCoverage(counters.get('CLASS')),
    note: '已解析 target/site/jacoco/jacoco.xml。',
  };
}

function formatCoverage(counter?: { missed: number; covered: number }): string | null {
  if (!counter) return null;
  const total = counter.missed + counter.covered;
  if (total <= 0) return '未采集';
  return `${Math.round((counter.covered / total) * 10000) / 100}% (${counter.covered}/${total})`;
}

function parseXmlAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of attrText.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

export function classifyMavenOutput(output: string): MavenClassification {
  const rules = loadClassificationRules();
  for (const rule of rules.categories) {
    if (rule.patterns.some(pattern => new RegExp(pattern, 'i').test(output))) {
      return { category: rule.category, reason: rule.reason };
    }
  }
  return rules.default;
}

function loadClassificationRules(): {
  categories: Array<{ category: MavenFailureCategory; patterns: string[]; reason: string }>;
  default: MavenClassification;
} {
  const raw = loadTemplate('maven-test-classification.json');
  return JSON.parse(raw);
}

function loadTemplate(fileName: string): string {
  const templatePath = path.join(process.cwd(), 'prompts', 'template', fileName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Output template not found: prompts/template/${fileName}`);
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}
