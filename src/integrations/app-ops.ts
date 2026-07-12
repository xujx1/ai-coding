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

export interface OpsCapability {
  name: string;
  description: string;
  category: 'builtin' | 'knowledge' | 'gitnexus' | 'mcp' | 'skill';
  status: 'registered' | 'available' | 'disabled';
}

export interface OpsWorkflowTemplate {
  id: string;
  name: string;
  mode: 'workflow' | 'intent-routing' | 'coordinator';
  description: string;
  nodes: Array<{
    id: string;
    label: string;
    description: string;
    tools: string[];
    scope: string;
  }>;
}

export interface OpsAlertHistoryEntry {
  id: string;
  appId: string;
  alert: string;
  category: OpsFaultCategory;
  categoryLabel: string;
  vector: Record<string, number>;
  createdAt: string;
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
  logEvidence: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  similarAlertEvidence: Array<{
    path: string;
    reason: string;
    snippet?: string;
    score?: number;
  }>;
  codeEvidence: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  knowledgeEvidence: Array<{
    path: string;
    source: 'knowledge-base' | 'gitnexus';
    reason: string;
    snippet?: string;
  }>;
  recommendedActions: string[];
  runbook: string[];
  toolResults: Array<{
    nodeId: string;
    label: string;
    tools: string[];
    status: 'completed' | 'skipped';
    output: string;
  }>;
}

export function listOpsCapabilities(): OpsCapability[] {
  return [
    { name: 'alert_parse', description: '解析告警文本中的服务、接口、traceId、错误关键词和时间窗口', category: 'builtin', status: 'registered' },
    { name: 'fault_classify', description: '按内置故障规则识别 Redis、MySQL、Dubbo、MQ、变更、依赖异常等类型', category: 'builtin', status: 'registered' },
    { name: 'grep', description: '按关键词检索应用源码、知识库和 GitNexus 产物', category: 'builtin', status: 'registered' },
    { name: 'glob', description: '按路径模式发现应用文件和产物文件', category: 'builtin', status: 'registered' },
    { name: 'read_file', description: '读取源码、配置、知识库分层文档和图谱 JSON', category: 'builtin', status: 'registered' },
    { name: 'alert_vector_search', description: '读取本地告警历史向量并计算相似度，找出相似预警记录', category: 'builtin', status: 'registered' },
    { name: 'knowledge_base_search', description: '检索 app-knowledge-base、global、registry 下的知识库内容', category: 'knowledge', status: 'registered' },
    { name: 'gitnexus_search', description: '检索 GitNexus nodes/edges/graph-summary/capability map', category: 'gitnexus', status: 'registered' },
    { name: 'dependency_graph_search', description: '基于 registry dependency-map 和 global GitNexus 图谱做上下游影响分析', category: 'gitnexus', status: 'registered' },
    { name: 'use_skill', description: '运行时加载 SKILL.md 定义的排查技能', category: 'skill', status: 'available' },
  ];
}

export function listOpsWorkflowTemplates(): OpsWorkflowTemplate[] {
  return [
    {
      id: 'fault-analysis',
      name: '故障分析 Workflow',
      mode: 'coordinator',
      description: '告警解析 -> 相似预警 -> 本地日志/Trace grep -> 源码 grep -> 应用知识库 -> 全局图谱上下游分析 -> 修复计划',
      nodes: [
        {
          id: 'alert-classify',
          label: '告警解析 Agent',
          description: '从告警文本中提取服务、接口、traceId、错误关键词和时间窗口，并完成故障类型初判。',
          tools: ['alert_parse', 'fault_classify'],
          scope: '告警文本',
        },
        {
          id: 'similar-alert',
          label: '相似预警 Agent',
          description: '从告警历史列表读取已存向量，按当前告警向量做相似度计算，找出可复用的历史预警。',
          tools: ['alert_vector_search'],
          scope: '告警历史向量',
        },
        {
          id: 'local-log-trace',
          label: '日志/Trace 采集 Agent',
          description: '用 grep/read_file 读取 demo/ecom/logs/ 下的本地应用日志，按服务名、traceId、错误关键词和时间窗口采集证据。',
          tools: ['grep', 'read_file'],
          scope: '本地日志 / Trace',
        },
        {
          id: 'code-context',
          label: '代码上下文 Agent',
          description: '用 grep/glob/read_file 读取 ai-coding 注册应用的本地源码，定位入口、依赖调用、配置和异常路径。',
          tools: ['glob', 'grep', 'read_file'],
          scope: '应用源码',
        },
        {
          id: 'app-knowledge',
          label: '应用知识库 Agent',
          description: '检索当前应用 app-knowledge-base、历史归档和 GitNexus 产物，补齐业务语义和历史排障经验。',
          tools: ['knowledge_base_search', 'gitnexus_search'],
          scope: '应用知识库',
        },
        {
          id: 'global-impact',
          label: '全局图谱 Agent',
          description: '读取全局知识库、dependency-map 和 GitNexus graph，分析上下游调用方、依赖方和可能的跨应用根因。',
          tools: ['knowledge_base_search', 'gitnexus_search', 'dependency_graph_search'],
          scope: '全局知识库 / 上下游图谱',
        },
        {
          id: 'repair-plan',
          label: '修复计划 Agent',
          description: '汇总代码证据、知识库证据和影响面，生成限流、降级、回滚、扩容或代码修复建议。',
          tools: ['read_file', 'use_skill'],
          scope: '诊断结论',
        },
      ],
    },
  ];
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
  const registryApps = Array.from(registry.entries());
  const appEntries = registryApps.length
    ? registryApps.map(([appId, app]) => ({
      appId,
      root: app.localPath && path.isAbsolute(app.localPath) ? app.localPath : path.join(ecomRoot, app.localPath ?? appId),
    }))
    : fs.readdirSync(ecomRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .filter(entry => !entry.name.startsWith('.') && entry.name !== 'spaces' && fs.existsSync(path.join(ecomRoot, entry.name, 'README.md')))
      .map(entry => ({ appId: entry.name, root: path.join(ecomRoot, entry.name) }));
  const apps = appEntries
    .filter(entry => fs.existsSync(entry.root))
    .map(entry => {
      const appId = entry.appId;
      const root = entry.root;
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
  workflowConfig?: {
    enabledNodeIds?: string[];
    nodeTools?: Record<string, string[]>;
  };
}): OpsAlertAnalysis {
  const applications = listOpsApplications(args.workspaceRoot);
  const app = applications.find(item => item.appId === args.appId) ?? applications[0];
  if (!app) throw new Error('No application repositories found');
  const classification = classifyOpsAlert(args.alert);
  const downstream = app.dependencies;
  const upstream = applications
    .filter(item => item.dependencies.includes(app.appId))
    .map(item => item.appId);
  const workflow = listOpsWorkflowTemplates()[0];
  const isEnabled = (nodeId: string): boolean => !args.workflowConfig?.enabledNodeIds
    || args.workflowConfig.enabledNodeIds.includes(nodeId);
  const nodeTools = (nodeId: string): string[] => {
    const templateNode = workflow.nodes.find(node => node.id === nodeId);
    return args.workflowConfig?.nodeTools?.[nodeId] ?? templateNode?.tools ?? [];
  };
  const logEvidence = isEnabled('local-log-trace') ? collectLogEvidence(path.dirname(app.root), app.appId, classification.category, args.alert) : [];
  const similarAlertEvidence = isEnabled('similar-alert') ? collectSimilarAlertEvidence(path.dirname(app.root), args.alert) : [];
  const evidence = isEnabled('code-context') ? collectCodeEvidence(app.root, classification.category, args.alert) : [];
  const knowledgeEvidence = (isEnabled('app-knowledge') || isEnabled('global-impact'))
    ? collectKnowledgeEvidence(path.dirname(app.root), app.appId, classification.category, args.alert)
    : [];
  const toolResults = buildOpsToolResults({
    workflow,
    isEnabled,
    nodeTools,
    categoryLabel: CATEGORY_LABELS[classification.category],
    logEvidence,
    similarAlertEvidence,
    codeEvidence: evidence,
    knowledgeEvidence,
    impact: { upstream, downstream, blastRadius: describeBlastRadius(upstream, downstream) },
  });
  const analysis: OpsAlertAnalysis = {
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
    logEvidence,
    similarAlertEvidence,
    codeEvidence: evidence,
    knowledgeEvidence,
    recommendedActions: buildRecommendedActions(classification.category, app, logEvidence, evidence, knowledgeEvidence),
    runbook: buildRunbook(classification.category, app),
    toolResults,
  };
  appendOpsAlertHistory(path.dirname(app.root), {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    appId: app.appId,
    alert: args.alert,
    category: classification.category,
    categoryLabel: CATEGORY_LABELS[classification.category],
    vector: buildAlertVector(args.alert),
    createdAt: new Date().toISOString(),
  });
  return analysis;
}

export function listOpsAlertHistory(workspaceRoot = process.cwd(), limit = 50): OpsAlertHistoryEntry[] {
  const ecomRoot = path.join(workspaceRoot, 'demo', 'ecom');
  return readOpsAlertHistory(ecomRoot).slice(0, limit);
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

function readAppsRegistry(ecomRoot: string): Map<string, { name?: string; description?: string; localPath?: string }> {
  const registryPath = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base', 'registry', 'apps.json');
  const result = new Map<string, { name?: string; description?: string; localPath?: string }>();
  const registry = readJson<{ apps?: Array<{ appId?: string; name?: string; domains?: string[]; tags?: string[]; codeRepo?: { localPath?: string; repoPath?: string } }> }>(registryPath);
  for (const app of registry?.apps ?? []) {
    if (!app.appId) continue;
    result.set(app.appId, {
      name: app.name,
      description: describeOpsApplication(app.appId, app.domains, app.tags),
      localPath: app.codeRepo?.localPath ?? app.codeRepo?.repoPath,
    });
  }
  return result;
}

function describeOpsApplication(appId: string, domains?: string[], tags?: string[]): string {
  const descriptions: Record<string, string> = {
    console: '运营控制台：面向业务和运维人员的前端入口，聚合订单、商品、用户等操作页面。',
    'ecom-aftersales': '售后服务：处理退款、退货、售后单流转，并联动交易、支付和履约链路。',
    'ecom-content': '内容服务：管理商品内容、素材和展示信息，支撑商品与商家内容运营。',
    'ecom-customer-service': '客服服务：承接用户咨询、订单查询和售后协同，连接用户、交易、售后和物流。',
    'ecom-finance': '财务服务：负责账务、结算、对账和财务口径数据，依赖支付、交易、营销和商家信息。',
    'ecom-fulfillment': '履约服务：承接下单后的履约编排，协调库存、用户信息和交易状态完成出库履约。',
    'ecom-inventory': '库存服务：维护商品库存、库存占用和释放，支撑交易扣减、履约出库和售后回补。',
    'ecom-logistics': '物流服务：管理发货、配送、轨迹和签收状态，承接履约结果并对客服链路提供查询。',
    'ecom-marketing': '营销服务：负责优惠、活动、券和价格促销规则，为交易链路提供营销计算能力。',
    'ecom-merchant': '商家服务：维护商家主体、资质和经营信息，支撑商品、财务和运营管理。',
    'ecom-payment': '支付服务：处理支付单、支付状态同步、退款联动和交易支付结果回写。',
    'ecom-product': '商品服务：维护商品资料、类目、价格基础信息，是交易、内容和库存的基础依赖。',
    'ecom-supply-chain': '供应链服务：协调库存、采购和财务结算，支撑跨库存与财务的供应链流程。',
    'ecom-trade': '交易服务：负责购物车、下单、订单状态流转和交易主链路编排。',
    'ecom-user': '用户服务：维护用户账户、画像和基础身份信息，是交易、营销和客服的基础依赖。',
  };
  if (descriptions[appId]) return descriptions[appId];
  return [domains?.join('/'), tags?.join('、')].filter(Boolean).join(' · ') || `${appId} 应用`;
}

function readDependencyMap(ecomRoot: string): Map<string, string[]> {
  const mapPath = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base', 'registry', 'dependency-map.json');
  const raw = readJson<Record<string, unknown>>(mapPath);
  const result = new Map<string, string[]>();
  const edges = Array.isArray(raw?.edges) ? raw.edges : [];
  for (const edge of edges) {
    if (!isRecord(edge)) continue;
    const from = firstString(edge.from, edge.fromAppId, edge.source, edge.sourceApp, edge.appId);
    const to = firstString(edge.to, edge.toAppId, edge.target, edge.targetApp, edge.dependsOn);
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

function collectLogEvidence(
  ecomRoot: string,
  appId: string,
  category: OpsFaultCategory,
  alert: string,
): OpsAlertAnalysis['logEvidence'] {
  const logsRoot = path.join(ecomRoot, 'logs');
  if (!fs.existsSync(logsRoot)) return [];
  const appLog = path.join(logsRoot, `${appId}.log`);
  const logFiles = [
    ...(fs.existsSync(appLog) ? [appLog] : []),
    ...fs.readdirSync(logsRoot, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.log'))
      .map(entry => path.join(logsRoot, entry.name))
      .filter(file => file !== appLog),
  ];
  const hintWords = Array.from(new Set([
    ...extractAlertTokens(alert),
    appId,
    'trace',
    'error',
    'exception',
    'timeout',
    ...(CATEGORY_CODE_HINTS[category] ?? []),
  ])).map(item => item.toLowerCase());
  const evidence: OpsAlertAnalysis['logEvidence'] = [];
  for (const file of logFiles) {
    if (evidence.length >= 8) break;
    const content = safeReadLarge(file);
    if (!content) continue;
    const lower = content.toLowerCase();
    const matched = hintWords.find(word => word.length >= 2 && lower.includes(word));
    if (!matched) continue;
    evidence.push({
      path: `logs/${path.relative(logsRoot, file)}`,
      reason: `${path.basename(file) === `${appId}.log` ? '当前应用日志' : '关联应用日志'} grep 命中 ${matched}`,
      snippet: extractSnippet(content, matched),
    });
    if (file === appLog) return evidence;
  }
  return evidence;
}

function collectSimilarAlertEvidence(
  ecomRoot: string,
  alert: string,
): OpsAlertAnalysis['similarAlertEvidence'] {
  const currentVector = buildAlertVector(alert);
  return readOpsAlertHistory(ecomRoot)
    .map(entry => ({ entry, score: cosineSimilarity(currentVector, entry.vector) }))
    .filter(item => item.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ entry, score }) => ({
      path: `alert-history/${entry.id}`,
      reason: `告警历史向量相似度 ${(score * 100).toFixed(1)}%`,
      score,
      snippet: [
        `应用：${entry.appId}`,
        `分类：${entry.categoryLabel}`,
        `时间：${entry.createdAt}`,
        `告警：${entry.alert}`,
      ].join('\n'),
    }));
}

function buildOpsToolResults(args: {
  workflow: OpsWorkflowTemplate;
  isEnabled: (nodeId: string) => boolean;
  nodeTools: (nodeId: string) => string[];
  categoryLabel: string;
  logEvidence: OpsAlertAnalysis['logEvidence'];
  similarAlertEvidence: OpsAlertAnalysis['similarAlertEvidence'];
  codeEvidence: OpsAlertAnalysis['codeEvidence'];
  knowledgeEvidence: OpsAlertAnalysis['knowledgeEvidence'];
  impact: OpsAlertAnalysis['impact'];
}): OpsAlertAnalysis['toolResults'] {
  return args.workflow.nodes.map(node => {
    if (!args.isEnabled(node.id)) {
      return { nodeId: node.id, label: node.label, tools: args.nodeTools(node.id), status: 'skipped', output: '节点已停用，未执行工具。' };
    }
    const tools = args.nodeTools(node.id);
    const outputByNode: Record<string, string> = {
      'alert-classify': `fault_classify => ${args.categoryLabel}`,
      'local-log-trace': `grep/read_file => 命中 ${args.logEvidence.length} 条本地日志证据。`,
      'similar-alert': `alert_vector_search => 命中 ${args.similarAlertEvidence.length} 条告警历史相似记录。`,
      'code-context': `grep/glob/read_file => 命中 ${args.codeEvidence.length} 个源码/配置文件。`,
      'app-knowledge': `knowledge_base_search/gitnexus_search => 命中 ${args.knowledgeEvidence.filter(item => item.source === 'knowledge-base').length} 条应用知识库证据。`,
      'global-impact': `dependency_graph_search/gitnexus_search => ${args.impact.blastRadius}`,
      'repair-plan': 'read_file/use_skill => 已汇总日志、代码、知识库和影响面，生成处置建议。',
    };
    return {
      nodeId: node.id,
      label: node.label,
      tools,
      status: 'completed',
      output: outputByNode[node.id] ?? '节点执行完成。',
    };
  });
}

function collectKnowledgeEvidence(
  ecomRoot: string,
  appId: string,
  category: OpsFaultCategory,
  alert: string,
): OpsAlertAnalysis['knowledgeEvidence'] {
  const knowledgeRoot = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base');
  if (!fs.existsSync(knowledgeRoot)) return [];
  const appKbRoot = path.join(knowledgeRoot, 'apps', appId, 'app-knowledge-base');
  const searchRoots = [
    { root: path.join(appKbRoot, 'gitnexus'), source: 'gitnexus' as const, limit: 3 },
    { root: path.join(knowledgeRoot, 'global', 'gitnexus-graph'), source: 'gitnexus' as const, limit: 3 },
    { root: appKbRoot, source: 'knowledge-base' as const, limit: 5 },
    { root: path.join(knowledgeRoot, 'global'), source: 'knowledge-base' as const, limit: 3 },
    { root: path.join(knowledgeRoot, 'registry'), source: 'knowledge-base' as const, limit: 3 },
  ].filter(item => fs.existsSync(item.root));
  const hintWords = [
    appId,
    ...(CATEGORY_CODE_HINTS[category] ?? []),
    ...extractAlertTokens(alert),
  ].map(item => item.toLowerCase());
  const evidence: OpsAlertAnalysis['knowledgeEvidence'] = [];
  for (const searchRoot of searchRoots) {
    let addedForRoot = 0;
    for (const file of listSourceFiles(searchRoot.root, 260)) {
      if (evidence.length >= 10) return evidence;
      if (addedForRoot >= searchRoot.limit) break;
      const content = safeRead(file);
      if (!content) continue;
      const lower = content.toLowerCase();
      const matched = hintWords.find(word => word.length >= 2 && lower.includes(word));
      if (!matched) continue;
      const relPath = path.relative(knowledgeRoot, file);
      evidence.push({
        path: `knowledge-base/${relPath}`,
        source: searchRoot.source,
        reason: `${searchRoot.source === 'gitnexus' ? 'GitNexus' : '知识库'} grep 命中 ${matched}`,
        snippet: extractSnippet(content, matched),
      });
      addedForRoot += 1;
    }
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
    `${app.name} 出现运行异常，需要先用告警文本、源码 grep、应用知识库和全局图谱确认根因范围`,
    '告警内容未命中明确规则，建议补充接口名、异常栈、traceId、实例和时间窗口',
  ];
}

function buildRecommendedActions(
  category: OpsFaultCategory,
  app: OpsApplication,
  logEvidence: OpsAlertAnalysis['logEvidence'],
  evidence: OpsAlertAnalysis['codeEvidence'],
  knowledgeEvidence: OpsAlertAnalysis['knowledgeEvidence'],
): string[] {
  const common = [
    `先按 ${app.appId} 的告警文本提取接口、依赖、异常关键词和时间窗口`,
    '使用本地日志 grep、本地源码 grep、应用知识库和全局 GitNexus 图谱交叉验证，而不是依赖外部日志/APM 平台',
  ];
  const categoryActions: Partial<Record<OpsFaultCategory, string[]>> = {
    MYSQL_POOL_EXHAUSTED: ['检查连接池配置、事务边界、慢查询风险代码和连接未释放路径', '必要时先限流非核心流量，再扩容连接池或回滚慢查询变更'],
    REDIS_TIMEOUT: ['检查 Redis 客户端配置、key 模式、连接池等待路径和缓存命中风险', '对热点 key 做降级或本地短缓存，避免穿透到数据库'],
    DUBBO_POOL_EXHAUSTED: ['检查 provider 线程池、consumer 超时、下游错误率和重试配置', '优先隔离慢依赖，必要时临时扩容 provider 实例'],
    MQ_BACKLOG: ['检查消费组 lag、失败消息、死信队列和消费者实例数', '暂停异常生产者或扩容消费者，并隔离 poison message'],
    MEMORY_EXHAUSTION: ['检查批量查询、本地缓存和大对象构造路径，定位堆增长风险', '临时降低批量大小或关闭高风险缓存写入'],
    PERFORMANCE_DEGRADATION: ['按 evidence 文件核对接口入口、Service 和 Mapper 查询路径', '对慢依赖设置超时/熔断，确认是否需要回滚近期发布'],
    CHANGE_INDUCED: ['比对最近发布版本、配置和数据库变更', '优先执行灰度回滚或关闭开关，再做根因复盘'],
    DEPENDENCY_FAILURE: ['检查下游依赖健康、注册中心、DNS 和连接池', '增加降级兜底，避免依赖故障拖垮主链路'],
  };
  const evidenceAction = evidence.length
    ? [`优先阅读 ${evidence.slice(0, 3).map(item => item.path).join('、')}，这些文件与告警关键词匹配度最高`]
    : ['当前代码扫描没有明显命中文件，需要补充接口名、异常栈或 traceId'];
  const logAction = logEvidence.length
    ? [`先核对 ${logEvidence.slice(0, 3).map(item => item.path).join('、')}，这些本地日志命中告警或 trace 关键词`]
    : [`本地日志 demo/ecom/logs/${app.appId}.log 未命中明显线索，建议补充 traceId、错误码或更精确时间窗口`];
  const knowledgeAction = knowledgeEvidence.length
    ? [`同步核对 ${knowledgeEvidence.slice(0, 3).map(item => item.path).join('、')}，这些知识库/GitNexus 产物命中告警关键词`]
    : ['知识库和 GitNexus 未命中明显线索，建议先刷新应用知识库或补充更具体告警字段'];
  return [...common, ...(categoryActions[category] ?? []), ...logAction, ...evidenceAction, ...knowledgeAction];
}

function buildRunbook(category: OpsFaultCategory, app: OpsApplication): string[] {
  return [
    `定位入口：选择 ${app.appId} 的核心接口、消费者或定时任务作为第一排查点`,
    `影响面：下游依赖 ${app.dependencies.length ? app.dependencies.join(', ') : '暂无显式依赖'}，上游可在依赖图中反查`,
    `分类结论：${CATEGORY_LABELS[category]}，先验证源码、应用知识库和全局图谱证据，再决定扩容、限流、降级、回滚或修复代码`,
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

function safeReadLarge(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 2_000_000) return undefined;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function getOpsAlertHistoryPath(ecomRoot: string): string {
  return path.join(ecomRoot, 'spaces', 'ops', 'alert-history.json');
}

function readOpsAlertHistory(ecomRoot: string): OpsAlertHistoryEntry[] {
  const history = readJson<{ alerts?: OpsAlertHistoryEntry[] }>(getOpsAlertHistoryPath(ecomRoot));
  return (history?.alerts ?? []).filter(item => item && typeof item.id === 'string')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function appendOpsAlertHistory(ecomRoot: string, entry: OpsAlertHistoryEntry): void {
  const historyPath = getOpsAlertHistoryPath(ecomRoot);
  const history = readOpsAlertHistory(ecomRoot);
  const alerts = [entry, ...history].slice(0, 200);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify({ alerts }, null, 2));
}

function buildAlertVector(alert: string): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const token of extractAlertTokens(alert).map(item => item.toLowerCase())) {
    if (token.length < 2) continue;
    vector[token] = (vector[token] ?? 0) + 1;
  }
  return vector;
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of Object.values(a)) normA += value * value;
  for (const value of Object.values(b)) normB += value * value;
  for (const [key, value] of Object.entries(a)) dot += value * (b[key] ?? 0);
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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
