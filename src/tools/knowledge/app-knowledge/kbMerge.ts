import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface ApiDocInfo {
  title: string;
  type: string;
  instantQps: string;
  peakQps: string;
  p99: string;
  purpose: string;
}

export function parseApiFile(filePath: string): ApiDocInfo {
  const content = fs.readFileSync(filePath, 'utf-8');
  const title = matchFirst(content, /^# (.+)$/m) ?? path.basename(filePath);
  let type = matchFirst(content, /接口类型[：:]\s*(.+)/) ?? '-';
  if (type.toUpperCase().includes('HTTP')) type = 'HTTP';
  else if (type.toLowerCase().includes('dubbo')) type = 'Dubbo';
  const purposeBlock = matchFirst(content, /## 接口作用\n+([\s\S]+?)(?=\n##|\Z)/);
  return {
    title: title.trim(),
    type: type.trim(),
    instantQps: matchFirst(content, /瞬时QPS[：:]\s*([\d.]+)/) ?? '-',
    peakQps: matchFirst(content, /峰值QPS[：:]\s*([\d.]+)/) ?? '-',
    p99: matchFirst(content, /99线RT[：:]\s*(.+)/) ?? matchFirst(content, /P99[：:]\s*(.+)/) ?? '-',
    purpose: purposeBlock ? purposeBlock.trim().split(/\r?\n/)[0].slice(0, 50) : '',
  };
}

export function buildIndexTable(apiFilesWithNum: Array<{ num: string; filePath: string }>): string {
  const rows = [
    '| 编号 | 接口名称 | 类型 | 瞬时QPS | 峰值QPS | 99线RT | 核心用途 |',
    '|------|---------|------|--------|--------|--------|---------|',
  ];
  for (const item of apiFilesWithNum) {
    const info = parseApiFile(item.filePath);
    rows.push(`| ${item.num} | ${info.title} | ${info.type} | ${info.instantQps} | ${info.peakQps} | ${info.p99} | ${info.purpose} |`);
  }
  return rows.join('\n');
}

export function mergeKnowledgeBase(args: {
  arch: string;
  apiDir: string;
  output: string;
  title?: string;
  now?: Date;
}): { output: string; bytes: number; total: number } {
  const archContent = fs.readFileSync(args.arch, 'utf-8');
  const apiFilesWithNum = fs.readdirSync(args.apiDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map(file => ({ num: file.split('_')[0], filePath: path.join(args.apiDir, file) }));
  const total = apiFilesWithNum.length;
  const month = formatMonth(args.now ?? new Date());
  const indexTable = buildIndexTable(apiFilesWithNum);
  const apiDetails = apiFilesWithNum.map(item => {
    const fileName = path.basename(item.filePath);
    const titlePart = fileName.replace(/\.md$/, '');
    return [
      '---',
      '',
      `## 接口${item.num}：${titlePart}`,
      '',
      fs.readFileSync(item.filePath, 'utf-8'),
      '',
    ].join('\n');
  }).join('\n');
  const systemName = path.basename(args.output).replace('知识库.md', '').replace(/\.md$/, '');
  const content = `# ${systemName}应用知识库

> 整理时间：${month}
> 覆盖范围：系统架构 + 业务全景 + ${total}个对外接口详细文档

---

# 第一部分：系统架构与业务全景

${archContent}

---

# 第二部分：接口全量索引（${total}个接口，按QPS从高到低）

${indexTable}

---

# 第三部分：接口详细文档

${apiDetails}
`;
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, content, 'utf-8');
  return { output: args.output, bytes: fs.statSync(args.output).size, total };
}

function matchFirst(content: string, pattern: RegExp): string | undefined {
  return pattern.exec(content)?.[1]?.trim();
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseArgs(argv: string[]): { arch?: string; apiDir?: string; output?: string; title?: string } {
  const result: { arch?: string; apiDir?: string; output?: string; title?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--arch') result.arch = argv[++i];
    else if (argv[i] === '--api-dir') result.apiDir = argv[++i];
    else if (argv[i] === '--output') result.output = argv[++i];
    else if (argv[i] === '--title') result.title = argv[++i];
  }
  return result;
}

function requireArgs(args: ReturnType<typeof parseArgs>): asserts args is { arch: string; apiDir: string; output: string; title?: string } {
  const missing = ['arch', 'apiDir', 'output'].filter(key => !args[key as keyof typeof args]);
  if (missing.length) throw new Error(`Missing required args: ${missing.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const result = mergeKnowledgeBase(args);
  console.log(`知识库文档已生成：${result.output}`);
  console.log(`文件大小：${result.bytes.toLocaleString()} bytes (${(result.bytes / 1024).toFixed(1)} KB)`);
  console.log(`接口总数：${result.total}`);
}
