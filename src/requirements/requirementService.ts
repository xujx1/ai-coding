export interface RequirementManagementServiceInfo {
  module: 'requirements';
  responsibility: string;
}

export function describeRequirementManagementService(): RequirementManagementServiceInfo {
  return {
    module: 'requirements',
    responsibility: 'Requirement inventory, MRD source browsing, approval state, and requirement artifacts.',
  };
}

export function getRequirementFiles(): never {
  throw new Error('Requirement file browsing is still served by src/server/app.ts during the staged migration.');
}

export function getRequirementFileContent(): never {
  throw new Error('Requirement file content is still served by src/server/app.ts during the staged migration.');
}
