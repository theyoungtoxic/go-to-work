import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface ProjectPaths {
  root: string;
  configDir: string;
  docsDir: string;
  scriptsDir: string;
  staticDir: string;
  runtimeDir: string;
  logsDir: string;
  screenshotsDir: string;
  stateDir: string;
  tempDir: string;
  policyFile: string;
  localPolicyFile: string;
  desktopBridgeScript: string;
  indicatorScript: string;
  indicatorStatusFile: string;
  stopSignalFile: string;
  authSecretFile: string;
  sessionFile: string;
}

export function resolveProjectPaths(): ProjectPaths {
  const root = process.env.GTW_HOME ? resolve(process.env.GTW_HOME) : resolve(process.cwd());
  return {
    root,
    configDir: resolve(root, "config"),
    docsDir: resolve(root, "docs"),
    scriptsDir: resolve(root, "scripts"),
    staticDir: resolve(root, "src", "static"),
    runtimeDir: resolve(root, "runtime"),
    logsDir: resolve(root, "runtime", "logs"),
    screenshotsDir: resolve(root, "runtime", "screenshots"),
    stateDir: resolve(root, "runtime", "state"),
    tempDir: resolve(root, "runtime", "temp"),
    policyFile: resolve(root, "config", "default-policy.json"),
    localPolicyFile: resolve(root, "config", "local-policy.json"),
    desktopBridgeScript: resolve(root, "scripts", "windows", "DesktopBridge.ps1"),
    indicatorScript: resolve(root, "scripts", "windows", "ActiveSessionIndicator.ps1"),
    indicatorStatusFile: resolve(root, "runtime", "state", "indicator-status.json"),
    stopSignalFile: resolve(root, "runtime", "state", "emergency-stop.json"),
    authSecretFile: resolve(root, "runtime", "state", "auth-secret.txt"),
    sessionFile: resolve(root, "runtime", "state", "sessions.json")
  };
}

export function ensureDirectory(pathname: string): void {
  mkdirSync(pathname, { recursive: true });
}

export function ensureParentDirectory(pathname: string): void {
  mkdirSync(dirname(pathname), { recursive: true });
}

export function ensureRuntimeDirectories(paths: ProjectPaths): void {
  [
    paths.configDir,
    paths.docsDir,
    paths.runtimeDir,
    paths.logsDir,
    paths.screenshotsDir,
    paths.stateDir,
    paths.tempDir
  ].forEach(ensureDirectory);
}
