export type Scope = "browser" | "desktop";
export type Sensitivity = "normal" | "sensitive" | "critical";
export type ApprovalMode = "approve_once" | "approve_session";
export type LogOutcome =
  | "blocked"
  | "pending_approval"
  | "denied"
  | "approved"
  | "completed"
  | "error"
  | "simulated"
  | "stopped";

export interface PolicyConfig {
  general: {
    productName: string;
    host: string;
    port: number;
    dryRunDefault: boolean;
  };
  session: {
    approvalTimeoutSeconds: number;
    singleActionLeaseSeconds: number;
    defaultTimedSessionMinutes: number;
    maxTimedSessionMinutes: number;
  };
  workspaces: {
    approvedRoots: string[];
  };
  browser: {
    allowedDomains: string[];
    blockedSchemes: string[];
    headless: boolean;
    sensitivePathKeywords: string[];
    sensitiveSelectorKeywords: string[];
  };
  desktop: {
    enabled: boolean;
    allowlistedProcessNames: string[];
    allowlistedWindowTitleKeywords: string[];
    maxScrollTicks: number;
    maxMouseTravelPixels: number;
  };
  approvals: {
    strongerApprovalForSensitive: boolean;
    captureBeforeAfterScreenshots: boolean;
  };
  logging: {
    maxRecentEntries: number;
  };
}

export interface ActionDescriptor {
  id: string;
  name: string;
  scope: Scope;
  summary: string;
  sensitivity: Sensitivity;
  metadata: Record<string, unknown>;
  redactions?: string[];
}

export interface PendingApproval {
  id: string;
  createdAt: string;
  expiresAt: string;
  action: ActionDescriptor;
  recommendedMode: ApprovalMode;
}

export interface ApprovalDecision {
  state: "approved" | "denied" | "expired";
  mode?: ApprovalMode;
  durationMinutes?: number;
  reason?: string;
}

export interface ControlLease {
  id: string;
  createdAt: string;
  expiresAt: string;
  scope: Scope;
  sensitivityCap: Sensitivity;
  mode: "single" | "timed";
  sourceApprovalId?: string;
  allowedActionIds?: string[];
  summary: string;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  outcome: LogOutcome;
  action: ActionDescriptor;
  message: string;
  details?: Record<string, unknown>;
  beforeScreenshotPath?: string;
  afterScreenshotPath?: string;
}

export interface WindowInfo {
  handle: string;
  title: string;
  processName: string;
}

export interface StatusSnapshot {
  dryRun: boolean;
  autoApproveMinutes: number;
  pendingApprovals: PendingApproval[];
  activeLeases: ControlLease[];
  recentLogs: ActionLogEntry[];
  policySummary: {
    browserDomains: string[];
    desktopProcesses: string[];
    desktopTitles: string[];
    approvedWorkspaces: string[];
  };
}
