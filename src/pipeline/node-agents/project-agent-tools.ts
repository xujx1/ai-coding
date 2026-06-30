import { ToolRegistry } from '../../tools/base.js';
import { ReadTool } from '../../tools/builtin/ReadTool.js';
import { WriteTool } from '../../tools/builtin/WriteTool.js';
import { EditTool } from '../../tools/builtin/EditTool.js';
import { GlobTool } from '../../tools/builtin/GlobTool.js';
import { GrepTool } from '../../tools/builtin/GrepTool.js';
import { registerJavaTools } from '../../tools/builtin/JavaTools.js';
import { DiscoverSkillsTool } from '../../tools/builtin/DiscoverSkillsTool.js';
import { SkillTool } from '../../tools/builtin/SkillTool.js';
import { ReviewArtifactTool } from '../../tools/builtin/ReviewArtifactTool.js';

export function createProjectToolRegistry(mode: 'read' | 'artifact' | 'code' | 'runner'): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  registerKnowledgeTools(registry);
  if (mode === 'artifact') {
    registry.register(WriteTool);
  }
  if (mode === 'code') {
    registry.register(WriteTool);
    registry.register(EditTool);
  }
  if (mode !== 'read') {
    registerJavaTools(registry);
  }
  return registry;
}

export function registerKnowledgeTools(registry: ToolRegistry): void {
  registry.register(DiscoverSkillsTool);
  registry.register(SkillTool);
  registry.register(ReviewArtifactTool);
}

export function getProjectTaskDescription(nodeId: string, projectName: string): string {
  const taskMap: Record<string, string> = {
    'java-impl': `写 ${projectName} 项目文件夹的代码`,
    'java-review': `评审 ${projectName} 项目文件夹的代码`,
    'frontend-impl': `写 ${projectName} 项目文件夹的前端代码`,
    'backend-test': `写 ${projectName} 项目文件夹的后端测试代码`,
    'frontend-test': `执行 ${projectName} 项目文件夹的前端测试`,
    'e2e-verify': `执行 ${projectName} 项目文件夹的端到端验证`,
    'testcode-generate': `写 ${projectName} 项目文件夹的测试代码`,
    'maven-test-runner': `执行 ${projectName} 项目文件夹的单元测试`,
    archive: `归档 ${projectName} 项目文件夹的修改结果`,
  };
  return taskMap[nodeId] || `${projectName} 项目任务`;
}
