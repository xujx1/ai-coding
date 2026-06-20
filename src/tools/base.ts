/**
 * Base Tool interface and ToolRegistry.
 */
import { z } from 'zod';

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface ToolContext {
  runId: string;
  agentRunId: string;
  nodeId?: string;
  projectName?: string;
  cwd: string;           // workspace/project directory
  runDir: string;        // full run directory
  projectDir: string;    // workspace/project
  artifactsDir: string;
  canUseTool: (toolName: string, input: unknown) => Promise<PermissionDecision>;
  onEvent?: (event: ToolEvent) => void;
  abortSignal?: AbortSignal;
}

export type ToolEvent =
  | { type: 'progress'; message: string }
  | { type: 'output_chunk'; chunk: string };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  isReadOnly: boolean;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
}

export interface ToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
  artifacts?: Array<{
    nodeId: string;
    artifactPath: string;
    size: number;
    description?: string;
  }>;
}

export interface Tool {
  definition: ToolDefinition;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  getApiSchema(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return this.list().map(t => ({
      name: t.definition.name,
      description: t.definition.description,
      input_schema: zodToJsonSchema(t.definition.inputSchema),
    }));
  }
}

// Minimal JSON Schema from Zod
function zodToJsonSchema(schema: z.ZodType<any>): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as any)._def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema(val as z.ZodTypeAny);
      const isOptional = val instanceof z.ZodOptional;
      if (!isOptional) required.push(key);
    }
    return { type: 'object', properties, required: required.length ? required : undefined };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodArray) return { type: 'array' };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: (schema as any)._def.values };
  return { type: 'string' };
}

function zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
  if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodNullable) {
    return zodTypeToJsonSchema((zodType as any)._def.innerType);
  }
  if (zodType instanceof z.ZodString) return { type: 'string' };
  if (zodType instanceof z.ZodNumber) return { type: 'number' };
  if (zodType instanceof z.ZodBoolean) return { type: 'boolean' };
  if (zodType instanceof z.ZodArray) return { type: 'array' };
  if (zodType instanceof z.ZodEnum) return { type: 'string', enum: (zodType as any)._def.values };
  if (zodType instanceof z.ZodObject) {
    const shape = (zodType as any)._def.shape();
    const props: Record<string, unknown> = {};
    const req: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      props[k] = zodTypeToJsonSchema(v as z.ZodTypeAny);
      if (!(v instanceof z.ZodOptional)) req.push(k);
    }
    return { type: 'object', properties: props, required: req.length ? req : undefined };
  }
  return { type: 'string' };
}
