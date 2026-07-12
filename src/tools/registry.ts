export type ToolCapabilityCategory =
  | 'builtin'
  | 'java'
  | 'git'
  | 'testing'
  | 'knowledge'
  | 'ops'
  | 'security'
  | 'skill';

export interface ToolCapabilityMetadata {
  name: string;
  category: ToolCapabilityCategory;
  owner: string;
  permissionScope: 'read' | 'write' | 'execute' | 'destructive' | 'external';
  description: string;
}

export const TOOL_CAPABILITIES: ToolCapabilityMetadata[] = [
  { name: 'read_file', category: 'builtin', owner: 'tools', permissionScope: 'read', description: 'Read a file within the allowed run workspace.' },
  { name: 'write_file', category: 'builtin', owner: 'tools', permissionScope: 'write', description: 'Write a file within the allowed run workspace.' },
  { name: 'edit_file', category: 'builtin', owner: 'tools', permissionScope: 'write', description: 'Apply controlled edits to a file within the allowed run workspace.' },
  { name: 'glob', category: 'builtin', owner: 'tools', permissionScope: 'read', description: 'Discover files by glob pattern.' },
  { name: 'grep', category: 'builtin', owner: 'tools', permissionScope: 'read', description: 'Search workspace text by pattern.' },
  { name: 'bash', category: 'builtin', owner: 'tools', permissionScope: 'execute', description: 'Run approved shell commands in a scoped workspace.' },
  { name: 'maven_compile', category: 'java', owner: 'tools', permissionScope: 'execute', description: 'Compile Maven projects through the Java tool adapter.' },
  { name: 'maven_test', category: 'java', owner: 'tools', permissionScope: 'execute', description: 'Run Maven tests through the Java tool adapter.' },
  { name: 'alert_vector_search', category: 'ops', owner: 'app-ops', permissionScope: 'read', description: 'Search local operations alert history vectors.' },
  { name: 'local_log_search', category: 'ops', owner: 'app-ops', permissionScope: 'read', description: 'Search local operation logs for trace and alert evidence.' },
  { name: 'code_context_search', category: 'ops', owner: 'app-ops', permissionScope: 'read', description: 'Search application source and config files for operation evidence.' },
  { name: 'ops_knowledge_search', category: 'ops', owner: 'app-ops', permissionScope: 'read', description: 'Search application knowledge and GitNexus artifacts for operation evidence.' },
  { name: 'dependency_graph_search', category: 'git', owner: 'app-ops', permissionScope: 'read', description: 'Analyze upstream and downstream dependency impact for an operations alert.' },
  { name: 'knowledge_base_search', category: 'knowledge', owner: 'knowledge', permissionScope: 'read', description: 'Search application and global knowledge-base artifacts.' },
  { name: 'gitnexus_search', category: 'git', owner: 'integrations', permissionScope: 'read', description: 'Search GitNexus graph and repository analysis artifacts.' },
  { name: 'testing_e2e_verification', category: 'testing', owner: 'tools', permissionScope: 'execute', description: 'Run E2E verification through startup, contract, smoke, and Playwright checks.' },
  { name: 'use_skill', category: 'skill', owner: 'agents', permissionScope: 'execute', description: 'Invoke a registered skill through the agent runtime.' },
];

export function listToolCapabilities(): ToolCapabilityMetadata[] {
  return [...TOOL_CAPABILITIES];
}
