import * as fs from 'fs';
import * as path from 'path';

const STAGE_PROMPT_FILES: Record<string, string> = {
  'mrd-render': 'mrd-render.md',
  'mrd-clarify': 'mrd-clarify.md',
  'implementation-plan': 'implementation-plan.md',
  'spec-generate': 'spec-generate.md',
  'java-impl': 'java-impl.md',
  'java-review': 'java-review.md',
  'testcode-generate': 'testcode-gen.md',
  'maven-test-runner': 'test-runner.md',
  archive: 'archive.md',
  // Backward-compatible aliases for older runs.
  'prd-generate': 'implementation-plan.md',
  'tech-design-generate': 'implementation-plan.md',
  'tech-design': 'implementation-plan.md',
  openspec: 'spec-generate.md',
  'openspec-optional': 'spec-generate.md',
  'test-spec': 'spec-generate.md',
  'testspec-generate': 'spec-generate.md',
  'test-code': 'testcode-gen.md',
  'maven-test': 'test-runner.md',
};

export function loadPromptTemplate(nodeId: string): string {
  const promptFile = STAGE_PROMPT_FILES[nodeId];
  if (!promptFile) {
    throw new Error(`Prompt template is not configured for stage: ${nodeId}`);
  }
  return loadPromptFile(promptFile);
}

export function loadPromptFile(fileName: string): string {
  const promptPath = path.join(process.cwd(), 'prompts', fileName);
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    throw new Error(`Prompt template not found: prompts/${fileName}`);
  }
}

export function loadOutputTemplate(fileName: string): string {
  const templatePath = path.join(process.cwd(), 'prompts', 'template', fileName);
  try {
    return fs.readFileSync(templatePath, 'utf-8');
  } catch {
    throw new Error(`Output template not found: prompts/template/${fileName}`);
  }
}

export function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}
