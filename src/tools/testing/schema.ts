import {
  TestingArtifactSchema,
  validateTestingArtifact,
  type TestingArtifact,
} from '../../lifecycle/testingArtifactSchemas.js';

export interface SchemaValidationResult {
  valid: boolean;
  artifact?: TestingArtifact;
  errors: string[];
}

export function validateTestingArtifactSchema(input: unknown): SchemaValidationResult {
  const result = TestingArtifactSchema.safeParse(input);
  if (result.success) {
    return { valid: true, artifact: validateTestingArtifact(result.data), errors: [] };
  }
  return {
    valid: false,
    errors: result.error.issues.map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
  };
}
