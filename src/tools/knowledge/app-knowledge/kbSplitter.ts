import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseApiFile } from './kbMerge.js';

export interface TopInterfaceInfo {
  num: string;
  title: string;
  type: string;
  peakQps: string;
  p99: string;
  purpose: string;
}

export function displayTitleFromKbOut(kbOut: string): string {
  const base = path.basename(path.resolve(kbOut.replace(/[\\/]$/, '')));
  if (!base || base === '.' || base === '..' || base === 'app-kb') return '应用知识库';
  return base;
}

export function extractTopInterfaces(apiDir: string, limit = 10): TopInterfaceInfo[] {
  return fs.readdirSync(apiDir)
    .filter(file => file.endsWith('.md') && file.includes('_'))
    .sort()
    .slice(0, limit)
    .map(file => {
      const info = parseApiFile(path.join(apiDir, file));
      return {
        num: file.split('_')[0],
        title: info.title,
        type: info.type,
        peakQps: info.peakQps,
        p99: info.p99,
        purpose: info.purpose,
      };
    });
}

export function buildInterfaceIndexTable(interfaces: TopInterfaceInfo[]): string {
  return [
    '| 编号 | 接口名称 | 类型 | 峰值QPS | 99线RT | 核心用途 |',
    '|------|---------|------|--------|--------|---------|',
    ...interfaces.map(info => `| ${info.num} | ${info.title} | ${info.type} | ${info.peakQps} | ${info.p99} | ${info.purpose} |`),
  ].join('\n');
}

export function splitKnowledgeBase(args: {
  apiDir: string;
  kbOut: string;
  now?: Date;
}): { output: string; topInterfaces: number; apiDocs: number } {
  const displayTitle = displayTitleFromKbOut(args.kbOut);
  const topInterfaces = extractTopInterfaces(args.apiDir, 10);
  fs.mkdirSync(args.kbOut, { recursive: true });
  const apiDocs = fs.readdirSync(args.apiDir).filter(file => file.endsWith('.md')).length;
  const overview = `# ${displayTitle} - 概览

> 整理时间：${formatMonth(args.now ?? new Date())}
> 覆盖范围：系统架构 + 业务全景 + ${apiDocs}个对外接口详细文档

## 知识库导航

### 文件索引
- 00_概览.md - 知识库导航 + 高频接口 + 文件索引
- 01_业务与领域知识层.md - 服务定位 / 域全景 / 领域模型 / 术语表
- 02_架构与设计层.md - DDD 结构 / 接口清单 / 表设计 / 外部依赖
- 03_核心流程与逻辑层.md - 核心流程 / MQ 消费者 / 定时任务 / 状态机
- 04_工程与规范层.md - 异常体系 / 代码规范 / 配置项
- 05_演进与决策记录层.md - ADR / 技术债务 / 演进路线

### 高频接口（Top 10）

${buildInterfaceIndexTable(topInterfaces)}

### 系统定位

在这里填写系统定位信息（从飞书文档中提取）

### 联系方式

- 负责人：相关团队
- 业务领域：业务领域描述
`;
  const output = path.join(args.kbOut, '00_概览.md');
  fs.writeFileSync(output, overview, 'utf-8');
  return { output, topInterfaces: topInterfaces.length, apiDocs };
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseArgs(argv: string[]): { apiDir?: string; kbOut?: string } {
  const result: { apiDir?: string; kbOut?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--api-dir') result.apiDir = argv[++i];
    else if (argv[i] === '--kb-out') result.kbOut = argv[++i];
  }
  return result;
}

function requireArgs(args: ReturnType<typeof parseArgs>): asserts args is { apiDir: string; kbOut: string } {
  const missing = ['apiDir', 'kbOut'].filter(key => !args[key as keyof typeof args]);
  if (missing.length) throw new Error(`Missing required args: ${missing.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const result = splitKnowledgeBase(args);
  console.log(`知识库概览文档已生成：${result.output}`);
}
