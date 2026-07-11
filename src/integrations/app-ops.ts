import * as fs from 'fs';
import * as path from 'path';

export type OpsFaultCategory =
  | 'CPU_EXHAUSTION'
  | 'MEMORY_EXHAUSTION'
  | 'DISK_EXHAUSTION'
  | 'IO_BOTTLENECK'
  | 'MYSQL_POOL_EXHAUSTED'
  | 'REDIS_TIMEOUT'
  | 'DUBBO_POOL_EXHAUSTED'
  | 'MQ_BACKLOG'
  | 'GC_FREQUENCY_HIGH'
  | 'GC_PAUSE_LONG'
  | 'POD_OFFLINE'
  | 'HEALTH_CHECK_FAIL'
  | 'CHANGE_INDUCED'
  | 'PERFORMANCE_DEGRADATION'
  | 'DEPENDENCY_FAILURE'
  | 'INFRA_NETWORK'
  | 'BUSINESS_DATA_INCONSISTENCY'
  | 'SECURITY_INCIDENT'
  | 'UNKNOWN';

export interface OpsApplication {
  appId: string;
  name: string;
  root: string;
  description?: string;
  dependencies: string[];
  apiCount: number;
  codeSignals: string[];
}

export interface OpsAlertAnalysis {
  app: OpsApplication;
  alert: string;
  category: OpsFaultCategory;
  categoryLabel: string;
  confidence: number;
  matchedKeywords: string[];
  likelyCauses: string[];
  impact: {
    upstream: string[];
    downstream: string[];
    blastRadius: string;
  };
  codeEvidence: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  recommendedActions: string[];
  runbook: string[];
}

const CATEGORY_LABELS: Record<OpsFaultCategory, string> = {
  CPU_EXHAUSTION: 'CPU资源耗尽',
  MEMORY_EXHAUSTION: '内存资源耗尽',
  DISK_EXHAUSTION: '磁盘资源耗尽',
  IO_BOTTLENECK: 'IO瓶颈',
  MYSQL_POOL_EXHAUSTED: 'MySQL连接池耗尽',
  REDIS_TIMEOUT: 'Redis超时',
  DUBBO_POOL_EXHAUSTED: 'Dubbo线程池耗尽',
  MQ_BACKLOG: 'MQ消息积压',
  GC_FREQUENCY_HIGH: 'GC频率过高',
  GC_PAUSE_LONG: 'GC停顿过长',
  POD_OFFLINE: 'Pod掉线',
  HEALTH_CHECK_FAIL: '健康检查失败',
  CHANGE_INDUCED: '变更引发',
  PERFORMANCE_DEGRADATION: '性能下降',
  DEPENDENCY_FAILURE: '依赖服务故障',
  INFRA_NETWORK: '基础设施网络',
  BUSINESS_DATA_INCONSISTENCY: '业务数据不一致',
  SECURITY_INCIDENT: '安全事件',
  UNKNOWN: '未知故障',
};

const CATEGORY_RULES: Array<{ category: OpsFaultCategory; keywords: string[]; requireAny?: string[] }> = [
  { category: 'CPU_EXHAUSTION', keywords: ['cpu'], requireAny: ['高', '飙', '100%', 'load'] },
  { category: 'MEMORY_EXHAUSTION', keywords: ['oom', 'out of memory', '堆内存', '内存', 'memory', 'heap'] },
  { category: 'DISK_EXHAUSTION', keywords: ['磁盘满', 'disk full', 'no space left', '磁盘', '空间不足'] },
  { category: 'IO_BOTTLENECK', keywords: ['io'], requireAny: ['瓶颈', '等待', 'iowait', '磁盘io'] },
  { category: 'MYSQL_POOL_EXHAUSTED', keywords: ['mysql', '数据库'], requireAny: ['连接池', 'connection pool', '数据库连接'] },
  { category: 'REDIS_TIMEOUT', keywords: ['redis'], requireAny: ['超时', 'timeout', 'bigkey'] },
  { category: 'DUBBO_POOL_EXHAUSTED', keywords: ['dubbo'], requireAny: ['线程池', '打满', '死锁', '连接'] },
  { category: 'MQ_BACKLOG', keywords: ['mq', '消息积压', 'kafka', 'rocketmq', '消费延迟', 'backlog'] },
  { category: 'GC_FREQUENCY_HIGH', keywords: ['gc'], requireAny: ['频繁', '频次', 'young gc', 'full gc'] },
  { category: 'GC_PAUSE_LONG', keywords: ['gc'], requireAny: ['停顿', 'pause', 'stw', 'stop-the-world'] },
  { category: 'POD_OFFLINE', keywords: ['pod'], requireAny: ['掉线', 'offline', '重启', '离线', '不可用'] },
  { category: 'HEALTH_CHECK_FAIL', keywords: ['健康检查', 'health check', 'liveness', 'readiness', '存活探针'] },
  { category: 'CHANGE_INDUCED', keywords: ['发布', 'deploy', '上线', '变更', '部署', 'rollback', 'rollout'] },
  { category: 'DEPENDENCY_FAILURE', keywords: ['connection refused', 'circuit breaker', '依赖', '下游', '上游', '服务不可用', '调用失败'] },
  { category: 'PERFORMANCE_DEGRADATION', keywords: ['slow', 'latency', 'p99', '响应慢', '性能下降', '变慢', '超时', 'timeout', '耗时增加'] },
  { category: 'SECURITY_INCIDENT', keywords: ['ddos', '401', '403', '注入', '安全', 'security', '漏洞', '攻击', '越权'] },
  { category: 'BUSINESS_DATA_INCONSISTENCY', keywords: ['不一致', '卡单', '状态机', '数据异常', '脏数据', '数据缺失'] },
  { category: 'INFRA_NETWORK', keywords: ['网络', 'dns', '丢包'] },
];

const SOURCE_EXTENSIONS = new Set([
  '.java', '.xml', '.yml', '.yaml', '.properties', '.sql', '.md', '.json', '.js', '.ts',
]);

const CATEGORY_CODE_HINTS: Partial<Record<OpsFaultCategory, string[]>> = {
  MYSQL_POOL_EXHAUSTED: ['jdbc', 'datasource', 'mysql', 'connection', 'repository', 'mapper'],
  REDIS_TIMEOUT: ['redis', 'cache', 'jedis', 'lettuce'],
  DUBBO_POOL_EXHAUSTED: ['dubbo', 'rpc', 'provider', 'consumer'],
  MQ_BACKLOG: ['kafka', 'rocketmq', 'rabbit', 'message', 'consumer', 'producer'],
  MEMORY_EXHAUSTION: ['cache', 'list', 'map', 'batch', 'heap', 'memory'],
  GC_FREQUENCY_HIGH: ['cache', 'batch', 'list', 'map', 'gc'],
  GC_PAUSE_LONG: ['cache', 'batch', 'list', 'map', 'gc'],
  PERFORMANCE_DEGRADATION: ['controller', 'service', 'repository', 'mapper', 'query', 'select'],
  DEPENDENCY_FAILURE: ['dubbo', 'client', 'http', 'rest', 'dependency', 'consumer'],
  HEALTH_CHECK_FAIL: ['health', 'actuator', 'server.port', 'application'],
  CHANGE_INDUCED: ['controller', 'service', 'mapper', 'application', 'config'],
  BUSINESS_DATA_INCONSISTENCY: ['domain', 'state', 'status', 'repository', 'mapper', 'sql'],
};

export function listOpsApplications(workspaceRoot = process.cwd()): OpsApplication[] {
  const ecomRoot = path.join(workspaceRoot, 'demo', 'ecom');
  if (!fs.existsSync(ecomRoot)) return [];
  const dependencyMap = readDependencyMap(ecomRoot);
  const registry = readAppsRegistry(ecomRoot);
  const apps = fs.readdirSync(ecomRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith('.') && entry.name !== 'spaces')
    .map(entry => {
      const appId = entry.name;
      const root = path.join(ecomRoot, appId);
      const registryApp = registry.get(appId);
      return {
        appId,
        name: registryApp?.name ?? appId,
        root,
        description: registryApp?.description ?? readAppDescription(root, appId),
        dependencies: dependencyMap.get(appId) ?? [],
        apiCount: countApiRoutes(root),
        codeSignals: detectCodeSignals(root),
      };
    })
    .sort((a, b) => a.appId.localeCompare(b.appId));
  return apps;
}

export function analyzeOpsAlert(args: {
  appId: string;
  alert: string;
  workspaceRoot?: string;
}): OpsAlertAnalysis {
  const applications = listOpsApplications(args.workspaceRoot);
  const app = applications.find(item => item.appId === args.appId) ?? applications[0];
  if (!app) throw new Error('No application repositories found');
  const classification = classifyOpsAlert(args.alert);
  const downstream = app.dependencies;
  const upstream = applications
    .filter(item => item.dependencies.includes(app.appId))
    .map(item => item.appId);
  const evidence = collectCodeEvidence(app.root, classification.category, args.alert);
  return {
    app,
    alert: args.alert,
    category: classification.category,
    categoryLabel: CATEGORY_LABELS[classification.category],
    confidence: classification.confidence,
    matchedKeywords: classification.matchedKeywords,
    likelyCauses: buildLikelyCauses(classification.category, app),
    impact: {
      upstream,
      downstream,
      blastRadius: describeBlastRadius(upstream, downstream),
    },
    codeEvidence: evidence,
    recommendedActions: buildRecommendedActions(classification.category, app, evidence),
    runbook: buildRunbook(classification.category, app),
  };
}

function classifyOpsAlert(alert: string): {
  category: OpsFaultCategory;
  confidence: number;
  matchedKeywords: string[];
} {
  const text = alert.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    const primary = rule.keywords.filter(keyword => text.includes(keyword.toLowerCase()));
    if (!primary.length) continue;
    const secondary = rule.requireAny?.filter(keyword => text.includes(keyword.toLowerCase())) ?? [];
    if (rule.requireAny && !secondary.length) continue;
    const matchedKeywords = [...primary, ...secondary];
    return {
      category: rule.category,
      confidence: Math.min(0.55 + matchedKeywords.length * 0.15, 0.95),
      matchedKeywords,
    };
  }
  return { category: 'UNKNOWN', confidence: 0.25, matchedKeywords: [] };
}

function readAppsRegistry(ecomRoot: string): Map<string, { name?: string; description?: string }> {
  const registryPath = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base', 'registry', 'apps.json');
  const result = new Map<string, { name?: string; description?: string }>();
  const registry = readJson<{ apps?: Array<{ appId?: string; name?: string; domains?: string[]; tags?: string[] }> }>(registryPath);
  for (const app of registry?.apps ?? []) {
    if (!app.appId) continue;
    result.set(app.appId, {
      name: app.name,
      description: [app.domains?.join('/'), app.tags?.join('、')].filter(Boolean).join(' · '),
    });
  }
  return result;
}

function readDependencyMap(ecomRoot: string): Map<string, string[]> {
  const mapPath = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base', 'registry', 'dependency-map.json');
  const raw = readJson<Record<string, unknown>>(mapPath);
  const result = new Map<string, string[]>();
  const edges = Array.isArray(raw?.edges) ? raw.edges : [];
  for (const edge of edges) {
    if (!isRecord(edge)) continue;
    const from = firstString(edge.from, edge.source, edge.sourceApp, edge.appId);
    const to = firstString(edge.to, edge.target, edge.targetApp, edge.dependsOn);
    if (!from || !to) continue;
    result.set(from, Array.from(new Set([...(result.get(from) ?? []), to])));
  }
  const dependencies = isRecord(raw?.dependencies) ? raw.dependencies : undefined;
  if (dependencies) {
    for (const [appId, value] of Object.entries(dependencies)) {
      if (Array.isArray(value)) {
        result.set(appId, Array.from(new Set([...value.map(String), ...(result.get(appId) ?? [])])));
      }
    }
  }
  return result;
}

function readAppDescription(root: string, appId: string): string | undefined {
  const readme = path.join(root, 'README.md');
  if (fs.existsSync(readme)) {
    const content = fs.readFileSync(readme, 'utf-8');
    const paragraph = content.split(/\r?\n/).find(line => {
      const text = line.trim();
      return text && !text.startsWith('#') && !text.startsWith('```');
    });
    if (paragraph) return paragraph.trim();
  }
  return `${appId} 应用`;
}

function countApiRoutes(root: string): number {
  let count = 0;
  for (const file of listSourceFiles(root, 200)) {
    const content = safeRead(file);
    if (!content) continue;
    const matches = content.match(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)|app\.(get|post|put|delete)\(/g);
    count += matches?.length ?? 0;
  }
  return count;
}

function detectCodeSignals(root: string): string[] {
  const signals = new Set<string>();
  for (const file of listSourceFiles(root, 260)) {
    const content = safeRead(file)?.toLowerCase() ?? '';
    if (!content) continue;
    if (content.includes('dubbo')) signals.add('Dubbo');
    if (content.includes('jdbc') || content.includes('datasource') || content.includes('mysql')) signals.add('MySQL/JDBC');
    if (content.includes('redis')) signals.add('Redis');
    if (content.includes('kafka') || content.includes('rocketmq') || content.includes('rabbit')) signals.add('MQ');
    if (content.includes('@getmapping') || content.includes('@postmapping') || content.includes('app.get(')) signals.add('HTTP API');
    if (content.includes('schedule') || content.includes('cron')) signals.add('定时任务');
  }
  return Array.from(signals).sort();
}

function collectCodeEvidence(root: string, category: OpsFaultCategory, alert: string): OpsAlertAnalysis['codeEvidence'] {
  const hintWords = [
    ...(CATEGORY_CODE_HINTS[category] ?? []),
    ...extractAlertTokens(alert),
  ].map(item => item.toLowerCase());
  const evidence: OpsAlertAnalysis['codeEvidence'] = [];
  for (const file of listSourceFiles(root, 500)) {
    if (evidence.length >= 8) break;
    const content = safeRead(file);
    if (!content) continue;
    const lower = content.toLowerCase();
    const matched = hintWords.find(word => word.length >= 2 && lower.includes(word));
    if (!matched) continue;
    evidence.push({
      path: path.relative(root, file),
      reason: `命中 ${matched}`,
      snippet: extractSnippet(content, matched),
    });
  }
  return evidence;
}

function buildLikelyCauses(category: OpsFaultCategory, app: OpsApplication): string[] {
  const defaults: Partial<Record<OpsFaultCategory, string[]>> = {
    MYSQL_POOL_EXHAUSTED: ['数据库连接池容量不足或连接泄露', '慢 SQL 导致连接长期占用', '下游数据库抖动放大请求堆积'],
    REDIS_TIMEOUT: ['Redis 访问超时或 big key 阻塞', '缓存穿透导致请求打到数据库', '网络或连接池配置不匹配'],
    DUBBO_POOL_EXHAUSTED: ['Dubbo 线程池被慢调用占满', '下游依赖超时导致调用堆积', '消费者并发超过 provider 承载'],
    MQ_BACKLOG: ['消费者处理能力不足', '单条消息处理失败反复重试', '上游突增流量超过消费速率'],
    MEMORY_EXHAUSTION: ['批量查询或本地缓存占用过高', '对象生命周期过长导致堆增长', '请求突增触发 OOM 风险'],
    PERFORMANCE_DEGRADATION: ['核心接口慢 SQL 或远程调用变慢', '依赖链路超时重试放大延迟', '新发布代码引入同步阻塞'],
    DEPENDENCY_FAILURE: ['依赖服务不可用或超时', '接口契约或配置变更不兼容', '网络/DNS/注册中心异常'],
    CHANGE_INDUCED: ['近期发布改变了核心逻辑或配置', '数据库/接口兼容性未覆盖', '灰度流量命中新路径'],
    BUSINESS_DATA_INCONSISTENCY: ['状态机或幂等逻辑异常', '跨服务事件最终一致性延迟', '补偿任务失败或重复执行'],
  };
  return defaults[category] ?? [
    `${app.name} 运行态指标异常，需要结合日志、链路和近期变更确认`,
    '告警内容未命中明确规则，建议先补充 traceId、接口名、实例和时间窗口',
  ];
}

function buildRecommendedActions(
  category: OpsFaultCategory,
  app: OpsApplication,
  evidence: OpsAlertAnalysis['codeEvidence'],
): string[] {
  const common = [
    `确认 ${app.appId} 告警时间窗口内的错误率、P95/P99、实例重启和发布记录`,
    '拉取同一时间窗口的日志和 trace，按接口/依赖维度聚合 top N',
  ];
  const categoryActions: Partial<Record<OpsFaultCategory, string[]>> = {
    MYSQL_POOL_EXHAUSTED: ['检查连接池活跃连接、等待线程、慢 SQL 和事务未关闭路径', '必要时先限流非核心流量，再扩容连接池或回滚慢查询变更'],
    REDIS_TIMEOUT: ['检查 Redis 慢日志、big key、连接池等待和缓存命中率', '对热点 key 做降级或本地短缓存，避免穿透到数据库'],
    DUBBO_POOL_EXHAUSTED: ['检查 provider 线程池、consumer 超时、下游错误率和重试配置', '优先隔离慢依赖，必要时临时扩容 provider 实例'],
    MQ_BACKLOG: ['检查消费组 lag、失败消息、死信队列和消费者实例数', '暂停异常生产者或扩容消费者，并隔离 poison message'],
    MEMORY_EXHAUSTION: ['抓取 heap dump 或 GC 日志，定位大对象和缓存增长路径', '临时降低批量大小或关闭高风险缓存写入'],
    PERFORMANCE_DEGRADATION: ['按 evidence 文件核对接口入口、Service 和 Mapper 查询路径', '对慢依赖设置超时/熔断，确认是否需要回滚近期发布'],
    CHANGE_INDUCED: ['比对最近发布版本、配置和数据库变更', '优先执行灰度回滚或关闭开关，再做根因复盘'],
    DEPENDENCY_FAILURE: ['检查下游依赖健康、注册中心、DNS 和连接池', '增加降级兜底，避免依赖故障拖垮主链路'],
  };
  const evidenceAction = evidence.length
    ? [`优先阅读 ${evidence.slice(0, 3).map(item => item.path).join('、')}，这些文件与告警关键词匹配度最高`]
    : ['当前代码扫描没有明显命中文件，需要补充接口名、异常栈或 traceId'];
  return [...common, ...(categoryActions[category] ?? []), ...evidenceAction];
}

function buildRunbook(category: OpsFaultCategory, app: OpsApplication): string[] {
  return [
    `定位入口：选择 ${app.appId} 的核心接口、消费者或定时任务作为第一排查点`,
    `影响面：下游依赖 ${app.dependencies.length ? app.dependencies.join(', ') : '暂无显式依赖'}，上游可在依赖图中反查`,
    `分类结论：${CATEGORY_LABELS[category]}，先验证指标证据，再决定扩容、限流、降级或回滚`,
  ];
}

function describeBlastRadius(upstream: string[], downstream: string[]): string {
  if (!upstream.length && !downstream.length) return '当前应用暂无显式上下游依赖，影响面先按单应用处理。';
  return [
    upstream.length ? `可能影响上游调用方：${upstream.join('、')}` : '',
    downstream.length ? `可能受下游依赖影响：${downstream.join('、')}` : '',
  ].filter(Boolean).join('；');
}

function extractAlertTokens(alert: string): string[] {
  return Array.from(new Set(alert
    .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 3)
    .slice(0, 12)));
}

function extractSnippet(content: string, keyword: string): string {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex(line => line.toLowerCase().includes(keyword.toLowerCase()));
  if (index < 0) return '';
  return lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join('\n').trim();
}

function listSourceFiles(root: string, limit: number): string[] {
  const result: string[] = [];
  const visit = (dir: string): void => {
    if (result.length >= limit) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (result.length >= limit) return;
      if (entry.name.startsWith('.') || entry.name === 'target' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        result.push(fullPath);
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
  return result;
}

function safeRead(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 300_000) return undefined;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function readJson<T>(file: string): T | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}
