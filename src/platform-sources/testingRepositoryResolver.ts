export interface TestingRepository {
  repositoryId: string;
  root: string;
  repositoryType: 'integration' | 'contract' | 'e2e';
  commands: { start?: string; seed?: string; test: string };
  capabilities: string[];
  applicationIds?: string[];
}

export interface TestingRepositoryResolver {
  resolve(input: { requirementId: string; applicationIds: string[]; repositoryType?: TestingRepository['repositoryType'] }): TestingRepository | null;
}

export class InMemoryTestingRepositoryResolver implements TestingRepositoryResolver {
  constructor(private readonly repositories: readonly TestingRepository[] = []) {}
  resolve(input: { requirementId: string; applicationIds: string[]; repositoryType?: TestingRepository['repositoryType'] }): TestingRepository | null {
    return this.repositories.find(repository =>
      (!input.repositoryType || repository.repositoryType === input.repositoryType) &&
      (!repository.applicationIds?.length || repository.applicationIds.some(id => input.applicationIds.includes(id)))
    ) ?? null;
  }
}
