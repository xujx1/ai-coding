export type PipelineAgentId =
  | 'upload-init'
  | 'mrd-render'
  | 'implementation-plan'
  | 'spec-generate'
  | 'java-impl'
  | 'testcode-generate'
  | 'cross-app-test'
  | 'archive';

export interface PipelineAgentDefinition {
  id: PipelineAgentId;
  label: string;
  description: string;
  defaultTools: string[];
  outputArtifacts: string[];
  usesReActLoop: boolean;
}
