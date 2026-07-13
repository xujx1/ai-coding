export interface ManagedRepositoryOverview {
  appId: string;
  name: string;
  repositoryType?: string;
  implementationApp?: boolean;
  description?: string;
  root: string;
  provider: string;
  isGitRepo: boolean;
  gitAddress: string;
  gitRoot?: string;
  remoteUrl?: string;
  currentBranch?: string;
  headSha?: string;
  shortHeadSha?: string;
  dirty: boolean;
  changedFiles: string[];
  changedFileCount: number;
  lastCommitAt?: string;
  gitError?: string;
  downloadUrl: string;
  requirementIds: string[];
}

export interface ManagedKnowledgeBaseOverview {
  id: string;
  runId: string;
  requirementId: string;
  scope: string;
  type: 'global' | 'application';
  level: '全局' | '应用';
  status: string;
  artifactCount: number;
  description?: string;
  updatedAt?: string;
  versionId?: string;
  knowledgeRoot?: string;
  kbPath?: string;
  fileRoot?: string;
  paths: string[];
}

export interface ManagedRequirementOverview {
  id: string;
  runId?: string;
  requirementId: string;
  name: string;
  status: string;
  phase: string;
  appCount: number;
  artifactCount: number;
  waitingApprovals: number;
  completedApprovals: number;
  type: 'session' | 'mrd';
  source: string;
  updatedAt?: string;
  fileRoot?: string;
  paths: string[];
}

export interface ManagedSessionApplication {
  appId: string;
  root?: string;
  branchName?: string;
  status?: string;
  role?: string;
}

export interface ManagementOverview {
  repositories: ManagedRepositoryOverview[];
  knowledgeBases: ManagedKnowledgeBaseOverview[];
  requirements: ManagedRequirementOverview[];
  pipelines: unknown[];
  generatedAt: string;
}
