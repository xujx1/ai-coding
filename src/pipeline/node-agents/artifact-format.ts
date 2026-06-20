export function normalizeMarkdownArtifact(output: string, title: string, fallback: string): string {
  let content = (output || '').trim();
  content = content.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!content) return fallback;
  if (/^(好的|以下是|我将|我会|Here is|Sure)/i.test(content.slice(0, 80))) {
    const headingIndex = content.search(/^#\s+/m);
    if (headingIndex > 0) content = content.slice(headingIndex).trim();
  }
  return content.startsWith('#') ? content : `# ${title}\n\n${content}`;
}

export function isUsableTechDesign(content: string): boolean {
  const text = content.trim();
  if (text.length < 800) return false;
  if (/我会先|我先|我将|当前任务是|先检查|先读取|需要读取/.test(text.slice(0, 300))) return false;
  const requiredSignals = ['影响范围', '实施步骤', '测试策略', '风险'];
  return requiredSignals.filter(signal => text.includes(signal)).length >= 3;
}

export function isUsableSpecArtifact(content: string, kind: 'dev' | 'test'): boolean {
  const text = content.trim();
  if (text.length < 300) return false;
  if (/我会先|我先|我将|当前任务是|先检查|先读取|需要读取/.test(text.slice(0, 300))) return false;
  if (!/^#\s+.+任务清单/m.test(text)) return false;
  if (!/^##\s+Phase\s+\d+[:：]/m.test(text)) return false;
  const checkboxCount = (text.match(/^\s*-\s+\[\s\]\s+\S+/gm) || []).length;
  if (checkboxCount < 5) return false;
  const forbiddenSections = kind === 'dev'
    ? ['## 变更摘要', '## 影响模块', '## 开发任务', '## 接口任务', '## 数据与配置任务', '## 兼容与迁移任务', '## 验收清单', '## 回滚说明']
    : ['## 测试范围', '## 测试文件', '## 单元测试用例', '## 断言要求', '## 回归场景', '## Maven 命令要求'];
  return !forbiddenSections.some(section => text.includes(section));
}

export function summarizeMarkdown(content: string, maxLength = 320): string {
  const text = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '暂无摘要。';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function inferRiskLevel(content: string): string {
  const text = content.toLowerCase();
  if (/高风险|high risk|阻断|不可逆|数据迁移|兼容性破坏|核心链路/.test(text)) return 'high';
  if (/中风险|medium risk|迁移|跨项目|跨服务|外部依赖|回滚/.test(text)) return 'medium';
  return 'low';
}
