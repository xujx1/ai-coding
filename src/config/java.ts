import type { JavaConfig } from './types.js';

export const DEFAULT_JAVA_CONFIG: JavaConfig = {
  javaHome: '',
  mavenHome: '',
};

export function loadJavaEnv(env: NodeJS.ProcessEnv = process.env): Partial<JavaConfig> {
  const config: Partial<JavaConfig> = {};
  if (env.JAVA_HOME) config.javaHome = env.JAVA_HOME;
  if (env.MAVEN_HOME) config.mavenHome = env.MAVEN_HOME;
  return config;
}
