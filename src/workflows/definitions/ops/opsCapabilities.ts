import { listToolCapabilities, type ToolCapabilityCategory } from '../../../tools/registry.js';
import { OPS_FAULT_WORKFLOW_NODES } from './opsFaultWorkflowGraph.js';

export type OpsCapabilityCategory =
  | ToolCapabilityCategory
  | 'gitnexus'
  | 'mcp';

export interface OpsCapability {
  name: string;
  description: string;
  category: OpsCapabilityCategory;
  status: 'registered' | 'available' | 'disabled';
}

const VIRTUAL_OPS_CAPABILITIES: OpsCapability[] = [];

export function listOpsCapabilities(): OpsCapability[] {
  const workflowToolNames = new Set(OPS_FAULT_WORKFLOW_NODES.flatMap(node => node.tools));
  const registeredTools = listToolCapabilities()
    .filter(tool => workflowToolNames.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      category: mapToolCategory(tool.category),
      status: 'registered' as const,
    }));
  const registeredNames = new Set(registeredTools.map(tool => tool.name));
  const virtualTools = VIRTUAL_OPS_CAPABILITIES
    .filter(tool => workflowToolNames.has(tool.name))
    .filter(tool => !registeredNames.has(tool.name));
  return [...registeredTools, ...virtualTools].sort((a, b) => a.name.localeCompare(b.name));
}

function mapToolCategory(category: ToolCapabilityCategory): OpsCapabilityCategory {
  if (category === 'git') return 'gitnexus';
  return category;
}
