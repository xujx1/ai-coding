import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface ConsoleNetworkDiagnostic {
  consoleErrors: string[];
  networkErrors: Array<{
    url: string;
    method?: string;
    status?: number;
    error?: string;
  }>;
  generatedAt: string;
}

export async function runBrowserVerification(args: {
  projectRoot: string;
  outputDir: string;
  frontendUrl?: string;
  playwrightConfig?: string;
  timeoutMs: number;
}): Promise<{
  ok: boolean;
  error?: string;
  artifactPaths: string[];
  diagnostics: ConsoleNetworkDiagnostic;
}> {
  const diagnostics = emptyDiagnostics();
  if (!args.frontendUrl && !args.playwrightConfig) {
    return {
      ok: false,
      error: 'No live frontend URL or project-owned Playwright config was available.',
      artifactPaths: [],
      diagnostics,
    };
  }
  if (args.playwrightConfig) {
    const reportPath = path.join(args.outputDir, 'playwright-report');
    const output = await runCommand(
      'npx',
      ['playwright', 'test', '--config', args.playwrightConfig, '--reporter=json'],
      args.projectRoot,
      args.timeoutMs
    );
    fs.mkdirSync(reportPath, { recursive: true });
    fs.writeFileSync(path.join(reportPath, 'project-playwright-output.json'), output.stdout || output.stderr || '{}', 'utf-8');
    return {
      ok: output.exitCode === 0,
      error: output.exitCode === 0 ? undefined : output.stderr || output.stdout || 'Project-owned Playwright failed.',
      artifactPaths: ['playwright-report/project-playwright-output.json'],
      diagnostics,
    };
  }

  try {
    return await runGeneratedPlaywrightSpec({
      projectRoot: args.projectRoot,
      outputDir: args.outputDir,
      frontendUrl: args.frontendUrl,
      timeoutMs: args.timeoutMs,
      diagnostics,
    });
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      artifactPaths: [],
      diagnostics,
    };
  }
}

function emptyDiagnostics(): ConsoleNetworkDiagnostic {
  return {
    consoleErrors: [],
    networkErrors: [],
    generatedAt: new Date().toISOString(),
  };
}

async function runGeneratedPlaywrightSpec(args: {
  projectRoot: string;
  outputDir: string;
  frontendUrl?: string;
  timeoutMs: number;
  diagnostics: ConsoleNetworkDiagnostic;
}): Promise<{
  ok: boolean;
  error?: string;
  artifactPaths: string[];
  diagnostics: ConsoleNetworkDiagnostic;
}> {
  if (!args.frontendUrl) {
    return {
      ok: false,
      error: 'No live frontend URL was available for generated Playwright verification.',
      artifactPaths: [],
      diagnostics: args.diagnostics,
    };
  }
  const reportDir = path.join(args.outputDir, 'playwright-report');
  const screenshotDir = path.join(args.outputDir, 'screenshots');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  const specPath = path.join(args.outputDir, 'generated-playwright.spec.js');
  const executionSpecPath = path.join(process.cwd(), 'generated-e2e-tests', `${safeFileSegment(path.basename(args.outputDir))}-${Date.now()}.spec.js`);
  const outputPath = path.join(reportDir, 'generated-playwright-output.json');
  const screenshotPath = path.join(screenshotDir, 'home.png');
  const expectedKeywords = inferExpectedVisibleKeywords(args.projectRoot);
  fs.writeFileSync(specPath, renderGeneratedPlaywrightSpec(), 'utf-8');
  fs.mkdirSync(path.dirname(executionSpecPath), { recursive: true });
  fs.writeFileSync(executionSpecPath, fs.readFileSync(specPath, 'utf-8'), 'utf-8');
  const cliSpecPath = path.relative(process.cwd(), executionSpecPath);
  const output = await runCommand(
    'npx',
    ['playwright', 'test', cliSpecPath, '--reporter=json', `--output=${path.join(args.outputDir, 'test-results')}`],
    process.cwd(),
    Math.max(args.timeoutMs, 30000),
    {
      E2E_FRONTEND_URL: args.frontendUrl,
      E2E_SCREENSHOT_PATH: screenshotPath,
      E2E_EXPECTED_KEYWORDS: JSON.stringify(expectedKeywords),
    }
  );
  const rawOutput = output.stdout || output.stderr || '{}';
  fs.writeFileSync(outputPath, rawOutput, 'utf-8');
  fs.rmSync(executionSpecPath, { force: true });
  const consoleErrors = extractPlaywrightConsoleErrors(rawOutput);
  args.diagnostics.consoleErrors.push(...consoleErrors);
  return {
    ok: output.exitCode === 0,
    error: output.exitCode === 0 ? undefined : output.stderr || output.stdout || 'Generated Playwright verification failed.',
    artifactPaths: [
      'generated-playwright.spec.js',
      'playwright-report/generated-playwright-output.json',
      ...(fs.existsSync(screenshotPath) ? ['screenshots/home.png'] : []),
    ],
    diagnostics: args.diagnostics,
  };
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'e2e';
}

function renderGeneratedPlaywrightSpec(): string {
  return `import { test, expect } from '@playwright/test';

test('generated app verification', async ({ page }) => {
  const frontendUrl = process.env.E2E_FRONTEND_URL;
  const screenshotPath = process.env.E2E_SCREENSHOT_PATH;
  const expectedKeywords = JSON.parse(process.env.E2E_EXPECTED_KEYWORDS || '[]');
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => {
    consoleErrors.push(error.message);
  });

  const response = await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
  expect(response && response.ok(), 'frontend should return a successful HTTP response').toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

  const bodyText = (await page.locator('body').innerText()).trim();
  expect(bodyText.length, 'page should render visible text').toBeGreaterThan(0);
  if (expectedKeywords.length > 0) {
    expect(
      expectedKeywords.some(keyword => bodyText.includes(keyword)),
      'page should contain at least one expected business keyword'
    ).toBeTruthy();
  }
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  expect(consoleErrors, 'page should not emit console errors').toEqual([]);
});
`;
}

function inferExpectedVisibleKeywords(projectRoot: string): string[] {
  const staticRoot = path.join(projectRoot, 'src/main/resources/static');
  const candidates = ['活动', '命中', '预览', '商品', 'SKU', '管理配置', '用户运行'];
  if (!fs.existsSync(staticRoot)) return [];
  const text = listFiles(staticRoot, 2)
    .filter(file => /\.(html|js|css|vue|tsx|jsx|ts)$/.test(file))
    .map(file => fs.readFileSync(path.join(staticRoot, file), 'utf-8'))
    .join('\n');
  return candidates.filter(keyword => text.includes(keyword)).slice(0, 5);
}

function listFiles(root: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth || !fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, maxDepth, depth + 1).map(file => path.join(entry.name, file)));
    } else {
      files.push(entry.name);
    }
  }
  return files;
}

function extractPlaywrightConsoleErrors(rawOutput: string): string[] {
  try {
    const parsed = JSON.parse(rawOutput);
    const errors: string[] = [];
    for (const suite of parsed.suites ?? []) {
      collectSpecErrors(suite, errors);
    }
    return errors;
  } catch {
    return [];
  }
}

function collectSpecErrors(node: any, errors: string[]): void {
  for (const spec of node.specs ?? []) {
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        for (const error of result.errors ?? []) {
          if (error.message) errors.push(String(error.message));
        }
      }
    }
  }
  for (const child of node.suites ?? []) collectSpecErrors(child, errors);
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      stderr += `\nTimed out after ${timeoutMs}ms.`;
    }, timeoutMs);
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('close', exitCode => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}
