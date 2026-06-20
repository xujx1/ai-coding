import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { getRunPaths } from '../../runtime/paths.js';

export function createProjectsZip(
  paths: ReturnType<typeof getRunPaths>,
  runId: string,
  projectNames: string[]
): string | undefined {
  if (!projectNames.length) return undefined;
  const downloadsDir = path.join(paths.artifactsDir, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });
  const zipRel = `downloads/${runId}-projects.zip`;
  const zipAbs = path.join(paths.artifactsDir, zipRel);
  try {
    execFileSync('zip', [
      '-qr',
      zipAbs,
      ...projectNames,
      '-x',
      '*/.git/*',
      '*/target/*',
      '*/node_modules/*',
      '*/logs/*',
    ], {
      cwd: paths.projectDir,
      stdio: 'ignore',
    });
    return zipRel;
  } catch {
    return undefined;
  }
}
