import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const TABLE_HEADER = [
  '| 编号 | 标题 | 链接 | 更新时间 |',
  '| --- | --- | --- | --- |',
];

export interface SearchDocsItem {
  title?: string;
  href?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchDocsItemsFile {
  wikiEntryUrl?: string;
  keyword?: string;
  expectedN?: string | number;
  collected?: number;
  items: SearchDocsItem[];
}

export function buildSearchDocsMarkdown(data: SearchDocsItemsFile): string {
  const keyword = data.keyword ?? '';
  const items = data.items ?? [];
  return [
    `# 飞书 Wiki 搜索结果索引（${keyword}）`,
    '',
    `- **Wiki 入口**：${data.wikiEntryUrl ?? ''}`,
    `- **搜索关键词**：${keyword}`,
    `- **页面声明结果数**：${data.expectedN ?? ''}`,
    `- **抓取条数（去重）**：${items.length}`,
    '',
    ...buildTableRows(items, 1, items.length),
    '',
  ].join('\n');
}

export function buildSearchDocsMd(args: {
  input?: string;
  output?: string;
  baseDir?: string;
} = {}): { output: string; rows: number } {
  const baseDir = args.baseDir ?? moduleDir();
  const input = args.input ?? path.join(baseDir, '_search_docs_items.json');
  const output = args.output ?? path.join(baseDir, '_search_docs.md');
  const data = JSON.parse(fs.readFileSync(input, 'utf-8')) as SearchDocsItemsFile;
  fs.writeFileSync(output, buildSearchDocsMarkdown(data), 'utf-8');
  return { output, rows: data.items.length };
}

function buildTableRows(items: SearchDocsItem[], startIndex: number, total: number): string[] {
  const lines = [...TABLE_HEADER];
  for (let offset = 0; offset < items.length; offset += 1) {
    const item = items[offset];
    const no = formatNo(startIndex + offset, total);
    lines.push(`| ${no} | ${escapeCell(item.title)} | ${escapeCell(item.href)} | ${timeCell(item.updatedAt)} |`);
  }
  return lines;
}

function escapeCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function formatNo(index: number, total: number): string {
  return total <= 99 ? String(index).padStart(2, '0') : String(index).padStart(3, '0');
}

function timeCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '未展示';
  return escapeCell(value);
}

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function parseArgs(argv: string[]): { input?: string; output?: string } {
  const result: { input?: string; output?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') result.input = argv[++i];
    else if (argv[i] === '--output') result.output = argv[++i];
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildSearchDocsMd(parseArgs(process.argv.slice(2)));
  console.log(`written ${result.output} rows=${result.rows} (single file)`);
}
