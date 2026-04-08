import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import type { ActionDescriptor, PolicyConfig, Sensitivity, WindowInfo } from "./types.js";
import type { ProjectPaths } from "./paths.js";

const policySchema = z.object({
  general: z.object({
    productName: z.string(),
    host: z.string(),
    port: z.number().int().positive(),
    dryRunDefault: z.boolean()
  }),
  session: z.object({
    approvalTimeoutSeconds: z.number().int().positive(),
    singleActionLeaseSeconds: z.number().int().positive(),
    defaultTimedSessionMinutes: z.number().int().positive(),
    maxTimedSessionMinutes: z.number().int().positive()
  }),
  workspaces: z.object({
    approvedRoots: z.array(z.string())
  }),
  browser: z.object({
    allowedDomains: z.array(z.string().min(1)),
    blockedSchemes: z.array(z.string().min(1)),
    headless: z.boolean(),
    sensitivePathKeywords: z.array(z.string().min(1)),
    sensitiveSelectorKeywords: z.array(z.string().min(1))
  }),
  desktop: z.object({
    enabled: z.boolean(),
    allowlistedProcessNames: z.array(z.string().min(1)),
    allowlistedWindowTitleKeywords: z.array(z.string().min(1)),
    neverAutoApproveProcesses: z.array(z.string()).default([]),
    neverAutoApproveTitleKeywords: z.array(z.string()).default([]),
    maxScrollTicks: z.number().int().positive(),
    maxMouseTravelPixels: z.number().int().positive()
  }),
  approvals: z.object({
    strongerApprovalForSensitive: z.boolean(),
    captureBeforeAfterScreenshots: z.boolean()
  }),
  logging: z.object({
    maxRecentEntries: z.number().int().positive()
  })
});

export function loadPolicy(paths: ProjectPaths): PolicyConfig {
  const base = JSON.parse(readFileSync(paths.policyFile, "utf8")) as Record<string, unknown>;
  const merged = existsSync(paths.localPolicyFile)
    ? deepMerge(base, JSON.parse(readFileSync(paths.localPolicyFile, "utf8")) as Record<string, unknown>)
    : base;

  const parsed = policySchema.parse(merged);
  return {
    ...parsed,
    workspaces: {
      approvedRoots: parsed.workspaces.approvedRoots.map((entry) => resolve(entry))
    }
  };
}

export function isBrowserUrlAllowed(policy: PolicyConfig, inputUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    return false;
  }

  if (policy.browser.blockedSchemes.includes(url.protocol)) {
    return false;
  }

  return policy.browser.allowedDomains.some((allowed) => domainMatches(allowed, url.hostname));
}

export function classifyBrowserSensitivity(
  policy: PolicyConfig,
  actionName: string,
  input: { url?: string; selector?: string }
): Sensitivity {
  const keywords = policy.browser.sensitiveSelectorKeywords.map((item) => item.toLowerCase());
  const selector = input.selector?.toLowerCase() ?? "";
  const matchedSelector = keywords.some((keyword) => selector.includes(keyword));
  if (matchedSelector) {
    return selector.includes("password") || selector.includes("token") ? "critical" : "sensitive";
  }

  const rawUrl = input.url;
  if (!rawUrl) {
    return actionName === "screenshot" ? "normal" : "sensitive";
  }

  try {
    const parsed = new URL(rawUrl);
    const lowerPath = `${parsed.pathname}${parsed.search}`.toLowerCase();
    const matchedPath = policy.browser.sensitivePathKeywords.some((keyword) => lowerPath.includes(keyword));
    if (matchedPath) {
      return lowerPath.includes("token") || lowerPath.includes("security") ? "critical" : "sensitive";
    }
  } catch {
    return "sensitive";
  }

  return actionName === "navigate" ? "sensitive" : "normal";
}

export function classifyDesktopSensitivity(actionName: string): Sensitivity {
  if (actionName === "list_windows" || actionName === "screenshot") {
    return "sensitive";
  }

  if (actionName === "focus_window" || actionName === "mouse_move" || actionName === "mouse_scroll") {
    return "sensitive";
  }

  return "critical";
}

export function isWindowAllowed(policy: PolicyConfig, windowInfo: WindowInfo): boolean {
  const processAllowed = policy.desktop.allowlistedProcessNames.some(
    (processName) => processName.toLowerCase() === windowInfo.processName.toLowerCase()
  );
  const titleAllowed = policy.desktop.allowlistedWindowTitleKeywords.some((keyword) =>
    windowInfo.title.toLowerCase().includes(keyword.toLowerCase())
  );
  return processAllowed || titleAllowed;
}

export function shouldBlockAutoApprove(policy: PolicyConfig, action: ActionDescriptor): boolean {
  // Critical actions are never auto-approved
  if (action.sensitivity === "critical") {
    return true;
  }

  // Sensitive actions are blocked from auto-approve when the policy says so
  if (action.sensitivity === "sensitive" && policy.approvals.strongerApprovalForSensitive) {
    return true;
  }

  // Check if the active window is in the never-auto-approve list
  if (action.scope === "desktop" && action.metadata.activeWindow) {
    const win = action.metadata.activeWindow as WindowInfo;
    const processBlocked = policy.desktop.neverAutoApproveProcesses.some(
      (proc) => proc.toLowerCase() === win.processName.toLowerCase()
    );
    if (processBlocked) {
      return true;
    }
    const titleBlocked = policy.desktop.neverAutoApproveTitleKeywords.some(
      (keyword) => win.title.toLowerCase().includes(keyword.toLowerCase())
    );
    if (titleBlocked) {
      return true;
    }
  }

  return false;
}

export function summarizeAction(action: ActionDescriptor): string {
  return `${action.scope}:${action.name} (${action.sensitivity})`;
}

export function compareSensitivity(left: Sensitivity, right: Sensitivity): number {
  return scoreSensitivity(left) - scoreSensitivity(right);
}

function scoreSensitivity(value: Sensitivity): number {
  if (value === "critical") {
    return 3;
  }
  if (value === "sensitive") {
    return 2;
  }
  return 1;
}

function domainMatches(allowed: string, actual: string): boolean {
  const loweredAllowed = allowed.toLowerCase();
  const loweredActual = actual.toLowerCase();
  if (loweredAllowed.startsWith("*.")) {
    const suffix = loweredAllowed.slice(1);
    return loweredActual.endsWith(suffix);
  }
  return loweredAllowed === loweredActual;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      result[key] = value.slice();
      continue;
    }
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
