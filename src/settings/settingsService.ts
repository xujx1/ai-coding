import { getConfig, updateJavaConfig } from '../config/index.js';

export interface RuntimeSettingsView {
  java: {
    javaHome?: string;
    mavenPath?: string;
  };
}

export function getRuntimeSettings(): RuntimeSettingsView {
  const latestConfig = getConfig();
  return {
    java: {
      javaHome: latestConfig.java.javaHome,
      mavenPath: latestConfig.java.mavenHome,
    },
  };
}

export function saveRuntimeSettings(input: { javaHome?: string; mavenPath?: string; mavenHome?: string }): RuntimeSettingsView & { saved: true } {
  const javaHome = typeof input.javaHome === 'string' ? input.javaHome.trim() : undefined;
  const mavenPath = typeof input.mavenPath === 'string'
    ? input.mavenPath.trim()
    : typeof input.mavenHome === 'string'
      ? input.mavenHome.trim()
      : undefined;

  const next = updateJavaConfig({
    ...(javaHome !== undefined ? { javaHome } : {}),
    ...(mavenPath !== undefined ? { mavenHome: mavenPath } : {}),
  });

  return {
    saved: true,
    java: {
      javaHome: next.java.javaHome,
      mavenPath: next.java.mavenHome,
    },
  };
}
