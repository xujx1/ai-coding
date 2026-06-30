import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../../config/index.js';

export interface MavenConfigPath {
  mavenHome: string;
  binDir: string;
  executable?: string;
}

export function createJavaProcessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const config = getConfig();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra,
  };
  const pathParts: string[] = [];
  if (config.java.javaHome && fs.existsSync(config.java.javaHome)) {
    env.JAVA_HOME = config.java.javaHome;
    pathParts.push(path.join(config.java.javaHome, 'bin'));
  }
  const mavenPath = resolveMavenConfigPath(config.java.mavenHome);
  if (mavenPath) {
    env.MAVEN_HOME = mavenPath.mavenHome;
    pathParts.push(mavenPath.binDir);
  }
  env.PATH = [...pathParts, process.env.PATH || ''].filter(Boolean).join(path.delimiter);
  return env;
}

export function resolveJavaToolCommand(tool: 'java' | 'javac' | 'mvn', shellQuoted = true): string {
  const executable = resolveJavaToolExecutable(tool);
  if (!executable) return tool;
  return shellQuoted ? shellQuote(executable) : executable;
}

export function resolveJavaToolExecutable(tool: 'java' | 'javac' | 'mvn'): string | undefined {
  const config = getConfig();
  if (tool === 'mvn') return resolveMavenConfigPath(config.java.mavenHome)?.executable;
  const candidate = config.java.javaHome ? path.join(config.java.javaHome, 'bin', tool) : '';
  return candidate && fs.existsSync(candidate) ? candidate : undefined;
}

export function resolveMavenConfigPath(configuredPath: string): MavenConfigPath | null {
  if (!configuredPath || !fs.existsSync(configuredPath)) return null;
  const stat = fs.statSync(configuredPath);
  if (stat.isFile()) {
    const binDir = path.dirname(configuredPath);
    return {
      mavenHome: path.dirname(binDir),
      binDir,
      executable: configuredPath,
    };
  }
  const executable = path.join(configuredPath, 'bin', 'mvn');
  return {
    mavenHome: configuredPath,
    binDir: path.join(configuredPath, 'bin'),
    executable: fs.existsSync(executable) ? executable : undefined,
  };
}

export function resolveMavenBin(configuredPath: string): string {
  return resolveMavenConfigPath(configuredPath)?.binDir ?? '';
}

export function resolveMavenHome(configuredPath: string): string {
  return resolveMavenConfigPath(configuredPath)?.mavenHome ?? '';
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
