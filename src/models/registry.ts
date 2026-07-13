/**
 * Model Registry - manages available LLM models and their capabilities.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface RegisteredModel {
  id: string;
  displayName: string;
  providerId: string;
  aliases?: string[];
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsThinking?: boolean;
  costLevel: 1 | 2 | 3 | 4 | 5;       // 1=cheapest, 5=most expensive
  speedLevel: 1 | 2 | 3 | 4 | 5;      // 1=slowest, 5=fastest
  intelligenceLevel: 1 | 2 | 3 | 4 | 5; // 1=least capable, 5=most capable
  recommendedFor: string[];
}

export interface RegisteredProvider {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyEnv?: string;
  compatRule: 'strict-openai' | 'permissive' | 'anthropic';
}

// ── Built-in Providers ─────────────────────────────────────────────────────

const BUILTIN_PROVIDERS: RegisteredProvider[] = [
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    compatRule: 'anthropic',
  },
  {
    id: 'openai-compat',
    displayName: 'OpenAI Compatible',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKeyEnv: 'LLM_API_KEY',
    compatRule: 'strict-openai',
  },
];

// ── Built-in Models ────────────────────────────────────────────────────────

const BUILTIN_MODELS: RegisteredModel[] = [
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    providerId: 'anthropic',
    aliases: ['opus', 'claude-opus'],
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsThinking: true,
    costLevel: 5,
    speedLevel: 2,
    intelligenceLevel: 5,
    recommendedFor: ['implementation-plan', 'java-review', 'repair-plan', 'ops-fault-analysis', 'complex-fix'],
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    providerId: 'anthropic',
    aliases: ['sonnet', 'claude-sonnet', 'default'],
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsThinking: true,
    costLevel: 3,
    speedLevel: 4,
    intelligenceLevel: 4,
    recommendedFor: ['mrd-render', 'spec-generate', 'java-impl', 'testcode-generate', 'similar-alert', 'local-log-trace', 'code-context', 'app-knowledge', 'general'],
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    providerId: 'anthropic',
    aliases: ['haiku', 'claude-haiku'],
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    costLevel: 1,
    speedLevel: 5,
    intelligenceLevel: 3,
    recommendedFor: ['archive', 'summarize', 'maven-test-runner', 'simple-tasks'],
  },
  {
    id: 'gpt-5',
    displayName: 'GPT-5',
    providerId: 'openai-compat',
    aliases: ['gpt5'],
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsThinking: true,
    costLevel: 4,
    speedLevel: 3,
    intelligenceLevel: 5,
    recommendedFor: ['java-impl', 'java-review'],
  },
  {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    providerId: 'openai-compat',
    aliases: ['gpt4o', 'gpt-4o'],
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    costLevel: 3,
    speedLevel: 4,
    intelligenceLevel: 4,
    recommendedFor: ['mrd-render', 'implementation-plan', 'java-impl'],
  },
  {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    providerId: 'openai-compat',
    aliases: ['gpt4o-mini', 'mini'],
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    costLevel: 1,
    speedLevel: 5,
    intelligenceLevel: 3,
    recommendedFor: ['archive', 'summarize', 'simple-tasks'],
  },
];

// ── Registry State ─────────────────────────────────────────────────────────

const providers = new Map<string, RegisteredProvider>(
  BUILTIN_PROVIDERS.map(p => [p.id, p])
);

const models = new Map<string, RegisteredModel>(
  BUILTIN_MODELS.map(m => [m.id, m])
);

const CUSTOM_REGISTRY_PATH = path.resolve(process.cwd(), '.ai-coding', 'custom-models.json');

// Register aliases
for (const model of BUILTIN_MODELS) {
  if (model.aliases) {
    for (const alias of model.aliases) {
      if (!models.has(alias)) {
        models.set(alias, { ...model, id: model.id });
      }
    }
  }
}

loadPersistedCustomRegistry();

// ── Public API ─────────────────────────────────────────────────────────────

export function registerProvider(provider: RegisteredProvider): void {
  providers.set(provider.id, provider);
}

export function registerModel(model: RegisteredModel): void {
  models.set(model.id, model);
  if (model.aliases) {
    for (const alias of model.aliases) {
      if (!models.has(alias)) {
        models.set(alias, { ...model, id: model.id });
      }
    }
  }
}

export function listModels(): RegisteredModel[] {
  // Return unique models (deduplicate by id)
  const seen = new Set<string>();
  const result: RegisteredModel[] = [];
  for (const model of models.values()) {
    if (!seen.has(model.id)) {
      seen.add(model.id);
      result.push(model);
    }
  }
  return result.sort((a, b) => b.intelligenceLevel - a.intelligenceLevel);
}

export function listCustomModels(): RegisteredModel[] {
  return listModels().filter(model => model.providerId === 'custom-openai-compatible');
}

export function getModel(id: string): RegisteredModel | undefined {
  return models.get(id);
}

export function validateModel(id: string): { valid: boolean; model?: RegisteredModel; reason?: string } {
  const model = models.get(id);
  if (!model) return { valid: false, reason: `Unknown model: ${id}` };
  const provider = providers.get(model.providerId);
  if (!provider) return { valid: false, reason: `Unknown provider: ${model.providerId}` };
  return { valid: true, model };
}

export function listProviders(): RegisteredProvider[] {
  return Array.from(providers.values()).map(provider => {
    const { apiKey, ...safeProvider } = provider;
    return safeProvider;
  });
}

export function getProvider(id: string): RegisteredProvider | undefined {
  return providers.get(id);
}

export function registerCustomModelSet(input: {
  providerId?: string;
  displayName?: string;
  baseUrl: string;
  apiKey?: string;
  modelIds: string[];
}): { provider: RegisteredProvider; models: RegisteredModel[]; stageOverrides: Record<string, string> } {
  const providerId = input.providerId || 'custom-openai-compatible';
  const provider: RegisteredProvider = {
    id: providerId,
    displayName: input.displayName || '自定义 OpenAI 兼容服务',
    baseUrl: normalizeBaseUrl(input.baseUrl),
    apiKey: input.apiKey,
    compatRule: 'strict-openai',
  };
  registerProvider(provider);

  const registeredModels = rankCustomModels(input.modelIds).map((modelInfo, index) => {
    const model: RegisteredModel = {
      id: modelInfo.id,
      displayName: modelInfo.id,
      providerId,
      aliases: index === 0 ? ['model90'] : undefined,
      contextWindow: modelInfo.contextWindow,
      supportsTools: true,
      supportsStreaming: true,
      supportsThinking: modelInfo.intelligenceLevel >= 4,
      costLevel: modelInfo.costLevel,
      speedLevel: modelInfo.speedLevel,
      intelligenceLevel: modelInfo.intelligenceLevel,
      recommendedFor: modelInfo.recommendedFor,
    };
    registerModel(model);
    return model;
  });

  const stageOverrides = buildStageOverrides(registeredModels);
  persistCustomRegistry(stageOverrides);
  return { provider, models: registeredModels, stageOverrides };
}

export function getCustomStageOverrides(): Record<string, string> {
  const persisted = loadPersistedCustomRegistryData();
  if (persisted?.stageOverrides && typeof persisted.stageOverrides === 'object') {
    const customModels = listCustomModels();
    const generated = customModels.length ? buildStageOverrides(customModels) : {};
    return { ...generated, ...(persisted.stageOverrides as Record<string, string>) };
  }
  const customModels = listCustomModels();
  return customModels.length ? buildStageOverrides(customModels) : {};
}

// ── Stage Model Routing ────────────────────────────────────────────────────

// Pipeline stage -> recommended model id
export const STAGE_MODEL_MAP: Record<string, string> = {
  'upload-init': 'claude-haiku-4-5',
  'mrd-render': 'claude-sonnet-4-6',
  'mrd-clarify': 'claude-sonnet-4-6',
  'implementation-plan': 'claude-opus-4-6',
  'spec-generate': 'claude-sonnet-4-6',
  'java-impl': 'claude-sonnet-4-6',
  'frontend-impl': 'claude-sonnet-4-6',
  'java-review': 'claude-opus-4-6',
  'similar-alert': 'claude-sonnet-4-6',
  'local-log-trace': 'claude-sonnet-4-6',
  'code-context': 'claude-sonnet-4-6',
  'app-knowledge': 'claude-sonnet-4-6',
  'global-impact': 'claude-sonnet-4-6',
  'repair-plan': 'claude-opus-4-6',
  'ops-fault-analysis': 'claude-opus-4-6',
  'testcode-generate': 'claude-sonnet-4-6',
  'maven-test-runner': 'claude-haiku-4-5',
  'archive': 'claude-haiku-4-5',
  // Backward-compatible aliases for runs created before the fixed pipeline IDs.
  'prd-generate': 'claude-opus-4-6',
  'tech-design-generate': 'claude-opus-4-6',
  'tech-design': 'claude-opus-4-6',
  'openspec': 'claude-sonnet-4-6',
  'openspec-optional': 'claude-sonnet-4-6',
  'test-spec': 'claude-sonnet-4-6',
  'testspec-generate': 'claude-sonnet-4-6',
  'test-code': 'claude-sonnet-4-6',
  'maven-test': 'claude-haiku-4-5',
  'mrd-clarification': 'claude-sonnet-4-6',
};

// When a stage fails N times, upgrade to higher intelligence
export function getModelForStage(
  stageId: string,
  failureCount: number = 0,
  overrides?: Record<string, string>
): RegisteredModel {
  const normalizedStageId = normalizeStageId(stageId);
  const customOverrides = getCustomStageOverrides();
  const override =
    overrides?.[normalizedStageId] ??
    overrides?.[stageId] ??
    customOverrides[normalizedStageId] ??
    customOverrides[stageId] ??
    overrides?._default;
  let modelId = override ?? STAGE_MODEL_MAP[normalizedStageId] ?? STAGE_MODEL_MAP[stageId] ?? 'claude-sonnet-4-6';
  let model = getModel(modelId);

  // Upgrade on repeated failures (for implementation/test stages)
  if (!override && failureCount >= 2 && ['java-impl', 'testcode-generate', 'maven-test-runner'].includes(normalizedStageId)) {
    const upgraded = listModels().find(
      m => m.intelligenceLevel > (model?.intelligenceLevel ?? 3) && m.supportsTools
    );
    if (upgraded) {
      model = getModel(upgraded.id) ?? model;
    }
  }

  // Downgrade for archive/summarize
  if (!override && ['archive'].includes(normalizedStageId)) {
    const lightModel = getModel('claude-haiku-4-5') ?? model;
    if (lightModel) model = lightModel;
  }

  return model ?? listModels()[0];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function rankCustomModels(modelIds: string[]): Array<{
  id: string;
  contextWindow: number;
  intelligenceLevel: 1 | 2 | 3 | 4 | 5;
  speedLevel: 1 | 2 | 3 | 4 | 5;
  costLevel: 1 | 2 | 3 | 4 | 5;
  recommendedFor: string[];
}> {
  const unique = Array.from(new Set(modelIds.map(id => id.trim()).filter(Boolean)));
  return unique
    .map(id => {
      const score = scoreModelName(id);
      const intelligenceLevel = toLevel(score.intelligence);
      return {
        id,
        contextWindow: score.contextWindow,
        intelligenceLevel,
        speedLevel: toLevel(score.speed),
        costLevel: toLevel(score.cost),
        recommendedFor: recommendedForLevel(intelligenceLevel),
      };
    })
    .sort((a, b) => b.intelligenceLevel - a.intelligenceLevel || b.contextWindow - a.contextWindow || a.id.localeCompare(b.id));
}

function scoreModelName(id: string): { intelligence: number; speed: number; cost: number; contextWindow: number } {
  const lower = id.toLowerCase();
  const numbers = Array.from(lower.matchAll(/(?:gpt|claude|model|qwen|deepseek|gemini|kimi|glm)?[-_ ]?(\d+(?:\.\d+)?)/g))
    .map(match => Number(match[1]))
    .filter(n => Number.isFinite(n));
  const versionScore = numbers.length ? Math.max(...numbers) : 4;
  let intelligence = Math.min(5, Math.max(2, Math.round(versionScore)));
  let speed = 3;
  let cost = Math.min(5, Math.max(1, intelligence));
  let contextWindow = 128000;

  if (lower.includes('mini') || lower.includes('haiku') || lower.includes('flash') || lower.includes('lite')) {
    intelligence = Math.min(intelligence, 3);
    speed = 5;
    cost = 1;
  }
  if (lower.includes('opus') || lower.includes('max') || lower.includes('pro')) {
    intelligence = 5;
    cost = 5;
    speed = Math.min(speed, 3);
  }
  if (lower.includes('sonnet') || lower.includes('turbo')) {
    intelligence = Math.max(intelligence, 4);
    speed = Math.max(speed, 4);
  }
  if (lower.includes('32k')) contextWindow = 32000;
  if (lower.includes('64k')) contextWindow = 64000;
  if (lower.includes('128k')) contextWindow = 128000;
  if (lower.includes('200k')) contextWindow = 200000;
  if (lower.includes('1m')) contextWindow = 1000000;

  return { intelligence, speed, cost, contextWindow };
}

function toLevel(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

function recommendedForLevel(level: number): string[] {
  if (level >= 5) return ['implementation-plan', 'java-review', 'repair-plan', 'ops-fault-analysis', 'complex-fix'];
  if (level >= 4) return ['mrd-render', 'spec-generate', 'java-impl', 'testcode-generate', 'similar-alert', 'local-log-trace', 'code-context', 'app-knowledge', 'general'];
  return ['archive', 'summarize', 'maven-test-runner', 'simple-tasks'];
}

function buildStageOverrides(registeredModels: RegisteredModel[]): Record<string, string> {
  const ranked = [...registeredModels].sort((a, b) => b.intelligenceLevel - a.intelligenceLevel || b.contextWindow - a.contextWindow);
  const strongest = ranked[0]?.id;
  const coder = ranked.find(m => m.supportsTools && m.id !== strongest)?.id || strongest;
  const light = [...registeredModels].sort((a, b) => a.costLevel - b.costLevel || b.speedLevel - a.speedLevel)[0]?.id || coder || strongest;
  const general = coder || strongest || light;

  if (!strongest) return {};
  return {
    'mrd-render': general,
    'mrd-clarify': general,
    'implementation-plan': strongest,
    'spec-generate': general,
    'java-impl': coder || strongest,
    'java-review': strongest,
    'similar-alert': general,
    'local-log-trace': general,
    'code-context': general,
    'app-knowledge': general,
    'global-impact': general,
    'repair-plan': strongest,
    'ops-fault-analysis': strongest,
    'testcode-generate': coder || strongest,
    'maven-test-runner': light || general,
    'archive': light || general,
  };
}

function persistCustomRegistry(stageOverrides: Record<string, string> = getCustomStageOverrides()): void {
  const customProviders = Array.from(providers.values()).filter(p => !BUILTIN_PROVIDERS.some(b => b.id === p.id));
  const customModels = listCustomModels();
  fs.mkdirSync(path.dirname(CUSTOM_REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(
    CUSTOM_REGISTRY_PATH,
    JSON.stringify({ providers: customProviders, models: customModels, stageOverrides }, null, 2),
    'utf-8'
  );
  fs.chmodSync(CUSTOM_REGISTRY_PATH, 0o600);
}

function loadPersistedCustomRegistry(): void {
  const raw = loadPersistedCustomRegistryData();
  if (!raw) return;
  for (const provider of raw.providers || []) registerProvider(provider);
  for (const model of raw.models || []) registerModel(model);
  if (!raw.stageOverrides && (raw.models?.length || 0) > 0) {
    persistCustomRegistry(buildStageOverrides(listCustomModels()));
  }
}

function loadPersistedCustomRegistryData(): { providers?: RegisteredProvider[]; models?: RegisteredModel[]; stageOverrides?: Record<string, string> } | null {
  try {
    if (!fs.existsSync(CUSTOM_REGISTRY_PATH)) return null;
    return JSON.parse(fs.readFileSync(CUSTOM_REGISTRY_PATH, 'utf-8'));
  } catch {
    // Ignore invalid custom registry files.
  }
  return null;
}

function normalizeStageId(stageId: string): string {
  const aliases: Record<string, string> = {
    'prd-generate': 'implementation-plan',
    'tech-design-generate': 'implementation-plan',
    'tech-design': 'implementation-plan',
    'implementation': 'implementation-plan',
    'openspec': 'spec-generate',
    'openspec-optional': 'spec-generate',
    'test-spec': 'spec-generate',
    'testspec-generate': 'spec-generate',
    'test-code': 'testcode-generate',
    'maven-test': 'maven-test-runner',
  };
  return aliases[stageId] ?? stageId;
}
