import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { nanoid } from "nanoid";

import { BrowserRunner } from "../automation/browser-runner.js";
import { DesktopRunner } from "../automation/desktop-runner.js";
import { ApprovalManager } from "./approvals.js";
import { loadOrCreateSecret } from "./auth.js";
import { AuditLogger } from "./logger.js";
import { ensureRuntimeDirectories, resolveProjectPaths, type ProjectPaths } from "./paths.js";
import {
  classifyBrowserSensitivity,
  classifyDesktopSensitivity,
  isBrowserUrlAllowed,
  isWindowAllowed,
  loadPolicy,
  shouldBlockAutoApprove
} from "./policy.js";
import { SessionManager } from "./session.js";
import type {
  ActionDescriptor,
  ActionLogEntry,
  ApprovalDecision,
  ApprovalMode,
  ControlLease,
  PolicyConfig,
  Sensitivity,
  StatusSnapshot,
  WindowInfo
} from "./types.js";

interface GuardedActionOptions {
  recommendedMode?: ApprovalMode;
  beforeAfterScope?: "browser" | "desktop";
}

export class GoToWorkService {
  public readonly paths: ProjectPaths;
  public readonly policy: PolicyConfig;
  public readonly logger: AuditLogger;
  public readonly authSecret: string;

  private readonly approvals: ApprovalManager;
  private readonly sessions: SessionManager;
  private readonly browserRunner: BrowserRunner;
  private readonly desktopRunner: DesktopRunner;
  private dryRun: boolean;
  private autoApproveMinutes: number = 0;
  private autoApproveTimer: NodeJS.Timeout | null = null;
  private indicatorProcess: ChildProcessWithoutNullStreams | null = null;
  private stopSignalInterval: NodeJS.Timeout | null = null;

  public constructor() {
    this.paths = resolveProjectPaths();
    ensureRuntimeDirectories(this.paths);
    this.policy = loadPolicy(this.paths);
    this.authSecret = loadOrCreateSecret(this.paths);
    this.logger = new AuditLogger(this.paths, this.policy.logging.maxRecentEntries);
    this.approvals = new ApprovalManager();
    this.sessions = new SessionManager();
    this.sessions.enablePersistence(this.paths.sessionFile);
    this.browserRunner = new BrowserRunner(this.paths, this.policy);
    this.desktopRunner = new DesktopRunner(this.paths, this.policy);
    this.dryRun = this.policy.general.dryRunDefault;
  }

  public async start(): Promise<void> {
    this.writeIndicatorStatus();
    this.stopSignalInterval = setInterval(() => {
      if (existsSync(this.paths.stopSignalFile)) {
        rmSync(this.paths.stopSignalFile, { force: true });
        void this.emergencyStop("Emergency stop hotkey or control UI");
      }

      this.sessions.pruneExpired();
      void this.syncIndicator();
    }, 500);
  }

  public async stop(): Promise<void> {
    if (this.stopSignalInterval) {
      clearInterval(this.stopSignalInterval);
      this.stopSignalInterval = null;
    }
    await this.browserRunner.close();
    this.desktopRunner.dispose();
    this.stopIndicator();
  }

  public getStatus(): StatusSnapshot {
    return {
      dryRun: this.dryRun,
      autoApproveMinutes: this.autoApproveMinutes,
      pendingApprovals: this.approvals.listPending(),
      activeLeases: this.sessions.getActive(),
      recentLogs: this.logger.getRecent(50),
      policySummary: {
        browserDomains: this.policy.browser.allowedDomains,
        desktopProcesses: this.policy.desktop.allowlistedProcessNames,
        desktopTitles: this.policy.desktop.allowlistedWindowTitleKeywords,
        approvedWorkspaces: this.policy.workspaces.approvedRoots
      }
    };
  }

  public setDryRun(enabled: boolean): StatusSnapshot {
    this.dryRun = enabled;
    this.logSystemEvent("completed", "runtime:set_dry_run", `Dry-run mode set to ${enabled}.`, { enabled });
    return this.getStatus();
  }

  public setAutoApprove(durationMinutes: number): StatusSnapshot {
    // Clear any existing auto-expire timer
    if (this.autoApproveTimer) {
      clearTimeout(this.autoApproveTimer);
      this.autoApproveTimer = null;
    }

    this.autoApproveMinutes = Math.max(0, Math.min(durationMinutes, this.policy.session.maxTimedSessionMinutes));

    if (this.autoApproveMinutes > 0) {
      // Auto-expire: turn off auto-approve after the selected duration
      this.autoApproveTimer = setTimeout(() => {
        this.autoApproveMinutes = 0;
        this.autoApproveTimer = null;
        this.logSystemEvent("completed", "runtime:set_auto_approve", "Auto-approve expired.", {});
      }, this.autoApproveMinutes * 60_000);

      // Flush any pending approvals immediately
      this.flushPendingApprovals();
    }

    this.logSystemEvent(
      "completed",
      "runtime:set_auto_approve",
      this.autoApproveMinutes > 0
        ? `Auto-approve enabled (${this.autoApproveMinutes}m sessions). Expires at ${new Date(Date.now() + this.autoApproveMinutes * 60_000).toLocaleTimeString()}.`
        : "Auto-approve disabled.",
      { durationMinutes: this.autoApproveMinutes }
    );
    return this.getStatus();
  }

  private flushPendingApprovals(): void {
    for (const pending of this.approvals.listPending()) {
      if (shouldBlockAutoApprove(this.policy, pending.action)) {
        this.logger.log(this.createLogEntry(
          "pending_approval",
          pending.action,
          `Auto-approve overridden (${pending.action.sensitivity}): ${pending.action.summary} — manual approval required.`
        ));
        continue;
      }
      try {
        this.approvals.decide(pending.id, {
          state: "approved",
          mode: "approve_session",
          durationMinutes: this.autoApproveMinutes
        });
      } catch {
        // Approval may have expired between listing and deciding
      }
    }
  }

  public decideApproval(approvalId: string, decision: ApprovalDecision): PendingApprovalResult {
    const approval = this.approvals.decide(approvalId, decision);
    this.logSystemEvent(
      decision.state === "approved" ? "approved" : "denied",
      "approval:decision",
      `${decision.state} ${approval.action.summary}`,
      {
        approvalId,
        decision
      }
    );
    return { approvalId, actionId: approval.action.id };
  }

  public async emergencyStop(source: string): Promise<void> {
    // Kill auto-approve
    this.autoApproveMinutes = 0;
    if (this.autoApproveTimer) {
      clearTimeout(this.autoApproveTimer);
      this.autoApproveTimer = null;
    }

    const revoked = this.sessions.revokeAll();
    this.logSystemEvent("stopped", "runtime:emergency_stop", `Emergency stop triggered by ${source}. Auto-approve disabled.`, {
      revokedLeaseCount: revoked.length
    });
    await this.syncIndicator();
  }

  public async browserNavigate(url: string): Promise<Record<string, unknown>> {
    if (!isBrowserUrlAllowed(this.policy, url)) {
      throw await this.blockedAction("browser", "navigate", `Blocked navigation to ${url}.`, { url });
    }

    const action = this.buildAction("browser", "navigate", `Navigate browser to ${url}`, {
      url
    });

    return this.runGuardedAction(
      action,
      () => this.browserRunner.navigate(url),
      { recommendedMode: "approve_session", beforeAfterScope: "browser" }
    );
  }

  public async browserClick(selector: string): Promise<Record<string, unknown>> {
    const currentUrl = await this.browserRunner.getCurrentUrl();
    if (!currentUrl || !isBrowserUrlAllowed(this.policy, currentUrl)) {
      throw await this.blockedAction("browser", "click", "Browser click blocked because the current page is outside the allowlist.", {
        selector,
        currentUrl
      });
    }

    const action = this.buildAction("browser", "click", `Click ${selector}`, {
      selector,
      url: currentUrl
    });

    return this.runGuardedAction(
      action,
      () => this.browserRunner.click(selector),
      { recommendedMode: "approve_once", beforeAfterScope: "browser" }
    );
  }

  public async browserFill(selector: string, value: string): Promise<Record<string, unknown>> {
    const currentUrl = await this.browserRunner.getCurrentUrl();
    if (!currentUrl || !isBrowserUrlAllowed(this.policy, currentUrl)) {
      throw await this.blockedAction("browser", "fill", "Browser fill blocked because the current page is outside the allowlist.", {
        selector,
        currentUrl
      });
    }

    const action = this.buildAction(
      "browser",
      "fill",
      `Fill ${selector}`,
      {
        selector,
        valueLength: value.length,
        url: currentUrl
      },
      ["value"]
    );

    return this.runGuardedAction(
      action,
      () => this.browserRunner.fill(selector, value),
      { recommendedMode: "approve_once", beforeAfterScope: "browser" }
    );
  }

  public async browserWait(selector: string | undefined, timeoutMs: number): Promise<Record<string, unknown>> {
    const currentUrl = await this.browserRunner.getCurrentUrl();
    const action = this.buildAction("browser", "wait", selector ? `Wait for ${selector}` : "Wait for page load", {
      selector,
      timeoutMs,
      url: currentUrl
    });

    return this.runGuardedAction(
      action,
      () => this.browserRunner.wait(selector, timeoutMs),
      { recommendedMode: "approve_once" }
    );
  }

  public async browserScreenshot(label?: string): Promise<Record<string, unknown>> {
    const currentUrl = await this.browserRunner.getCurrentUrl();
    const action = this.buildAction("browser", "screenshot", `Capture browser screenshot${label ? `: ${label}` : ""}`, {
      label,
      url: currentUrl
    });

    return this.runGuardedAction(
      action,
      () => this.browserRunner.captureScreenshot(label),
      { recommendedMode: "approve_once" }
    );
  }

  public async desktopListWindows(): Promise<Record<string, unknown>> {
    const action = this.buildAction("desktop", "list_windows", "List desktop windows", {});
    return this.runGuardedAction(action, async () => {
      const windows = await this.desktopRunner.listWindows();
      const filtered = windows.filter((windowInfo) => isWindowAllowed(this.policy, windowInfo));
      return {
        windows: filtered
      };
    }, { recommendedMode: "approve_once" });
  }

  public async desktopFocusWindow(windowHandle: string): Promise<Record<string, unknown>> {
    const windows = await this.desktopRunner.listWindows();
    const target = windows.find((entry) => entry.handle === windowHandle);
    if (!target) {
      throw await this.blockedAction("desktop", "focus_window", `No window found for handle ${windowHandle}.`, {
        windowHandle
      });
    }
    if (!isWindowAllowed(this.policy, target)) {
      throw await this.blockedAction("desktop", "focus_window", `Window ${target.title} is outside the desktop allowlist.`, {
        target
      });
    }

    const action = this.buildAction("desktop", "focus_window", `Focus ${target.title}`, {
      target
    });
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.focusWindow(windowHandle),
      { recommendedMode: "approve_once", beforeAfterScope: "desktop" }
    );
  }

  public async desktopMouseMove(x: number, y: number): Promise<Record<string, unknown>> {
    const max = this.policy.desktop.maxMouseTravelPixels;
    if (x < 0 || y < 0 || x > max || y > max) {
      throw await this.blockedAction(
        "desktop",
        "mouse_move",
        `Mouse target (${x},${y}) exceeds maxMouseTravelPixels (${max}).`,
        { x, y, max }
      );
    }

    const activeWindow = await this.assertAllowedActiveWindow("mouse_move");
    const action = this.buildAction("desktop", "mouse_move", `Move mouse to ${x},${y}`, {
      x,
      y,
      activeWindow
    });
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.mouseMove(x, y),
      { recommendedMode: "approve_once", beforeAfterScope: "desktop" }
    );
  }

  public async desktopMouseClick(button: "left" | "right"): Promise<Record<string, unknown>> {
    const activeWindow = await this.assertAllowedActiveWindow("mouse_click");
    const action = this.buildAction("desktop", "mouse_click", `Mouse ${button} click`, {
      button,
      activeWindow
    });
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.mouseClick(button),
      { recommendedMode: "approve_once", beforeAfterScope: "desktop" }
    );
  }

  public async desktopMouseScroll(delta: number): Promise<Record<string, unknown>> {
    const activeWindow = await this.assertAllowedActiveWindow("mouse_scroll");
    const boundedDelta = Math.max(-this.policy.desktop.maxScrollTicks, Math.min(this.policy.desktop.maxScrollTicks, delta));
    const action = this.buildAction("desktop", "mouse_scroll", `Mouse scroll ${boundedDelta}`, {
      delta: boundedDelta,
      activeWindow
    });
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.mouseScroll(boundedDelta),
      { recommendedMode: "approve_once", beforeAfterScope: "desktop" }
    );
  }

  public async desktopKeyboardText(text: string): Promise<Record<string, unknown>> {
    const activeWindow = await this.assertAllowedActiveWindow("keyboard_text");
    const action = this.buildAction(
      "desktop",
      "keyboard_text",
      `Type text into ${activeWindow.title}`,
      {
        textLength: text.length,
        activeWindow
      },
      ["text"]
    );
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.keyboardText(text),
      { recommendedMode: "approve_once", beforeAfterScope: "desktop" }
    );
  }

  public async desktopKeyboardKey(key: string): Promise<Record<string, unknown>> {
    const activeWindow = await this.assertAllowedActiveWindow("keyboard_key");
    const action = this.buildAction("desktop", "keyboard_key", `Press ${key}`, {
      key,
      activeWindow
    });
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.keyboardKey(key),
      { recommendedMode: "approve_once", beforeAfterScope: "desktop" }
    );
  }

  public async desktopKeyboardHotkey(keys: string[]): Promise<Record<string, unknown>> {
    const activeWindow = await this.assertAllowedActiveWindow("keyboard_hotkey");
    const action = this.buildAction("desktop", "keyboard_hotkey", `Press hotkey ${keys.join("+")}`, {
      keys,
      activeWindow
    });
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.keyboardHotkey(keys),
      { recommendedMode: "approve_once", beforeAfterScope: "desktop" }
    );
  }

  public async desktopScreenshot(label?: string): Promise<Record<string, unknown>> {
    const action = this.buildAction("desktop", "screenshot", `Capture desktop screenshot${label ? `: ${label}` : ""}`, {
      label
    });
    return this.runGuardedAction(
      action,
      () => this.desktopRunner.captureScreenshot(label),
      { recommendedMode: "approve_once" }
    );
  }

  private buildAction(
    scope: "browser" | "desktop",
    name: string,
    summary: string,
    metadata: Record<string, unknown>,
    redactions?: string[]
  ): ActionDescriptor {
    const sensitivity =
      scope === "browser"
        ? classifyBrowserSensitivity(this.policy, name, {
            url: typeof metadata.url === "string" ? metadata.url : undefined,
            selector: typeof metadata.selector === "string" ? metadata.selector : undefined
          })
        : classifyDesktopSensitivity(name);

    return {
      id: nanoid(),
      scope,
      name,
      summary,
      sensitivity,
      metadata,
      redactions
    };
  }

  private async runGuardedAction<T>(
    action: ActionDescriptor,
    handler: () => Promise<T>,
    options: GuardedActionOptions = {}
  ): Promise<T> {
    this.sessions.pruneExpired();

    let temporaryLease: ControlLease | null = null;
    const alreadyAllowed = this.sessions.canRun(action);
    if (!alreadyAllowed) {
      const blocked = shouldBlockAutoApprove(this.policy, action);
      if (this.autoApproveMinutes > 0 && !blocked) {
        this.logger.log(this.createLogEntry("approved", action, `Auto-approved: ${action.summary}`));
        temporaryLease = this.sessions.grantTimedLease(
          action.scope,
          action.sensitivity,
          this.autoApproveMinutes,
          `Auto-approved ${action.scope} session`
        );
      } else {
        if (blocked && this.autoApproveMinutes > 0) {
          this.logger.log(this.createLogEntry(
            "pending_approval",
            action,
            `Auto-approve overridden (${action.sensitivity}): ${action.summary} — manual approval required.`
          ));
        }
        this.logger.log(this.createLogEntry("pending_approval", action, `Waiting for user approval: ${action.summary}`));
        const decision = await this.approvals.requestApproval(
          action,
          this.policy.session.approvalTimeoutSeconds,
          options.recommendedMode ?? "approve_once"
        );

        if (decision.state !== "approved") {
          this.logger.log(this.createLogEntry("denied", action, decision.reason ?? "The user denied the action."));
          throw new Error(decision.reason ?? "The user denied the action.");
        }

        temporaryLease =
          decision.mode === "approve_session"
            ? this.sessions.grantTimedLease(
                action.scope,
                action.sensitivity,
                Math.min(
                  decision.durationMinutes ?? this.policy.session.defaultTimedSessionMinutes,
                  this.policy.session.maxTimedSessionMinutes
                ),
                `Timed ${action.scope} session`
              )
            : this.sessions.grantSingleActionLease(
                action,
                this.policy.session.singleActionLeaseSeconds
              );
      }
    }

    await this.syncIndicator();
    const captureScope = this.policy.approvals.captureBeforeAfterScreenshots ? options.beforeAfterScope : undefined;
    const beforeScreenshotPath = captureScope
      ? await this.captureScopeScreenshot(captureScope, `${action.name}-before`)
      : undefined;

    try {
      if (this.dryRun) {
        const simulated = {
          ok: true,
          simulated: true,
          action
        } as T;
        this.logger.log(
          this.createLogEntry("simulated", action, `Dry-run simulated ${action.summary}.`, {
            beforeScreenshotPath
          })
        );
        return simulated;
      }

      const result = await handler();
      const afterScreenshotPath = captureScope
        ? await this.captureScopeScreenshot(captureScope, `${action.name}-after`)
        : undefined;
      this.logger.log(
        this.createLogEntry("completed", action, `${action.summary} completed successfully.`, {
          beforeScreenshotPath,
          afterScreenshotPath
        })
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.log(
        this.createLogEntry("error", action, `${action.summary} failed: ${message}`, {
          beforeScreenshotPath
        })
      );
      throw error;
    } finally {
      if (temporaryLease?.mode === "single") {
        this.sessions.consumeSingleUseLeases(action.id);
      }
      await this.syncIndicator();
    }
  }

  private async assertAllowedActiveWindow(actionName: string): Promise<WindowInfo> {
    const activeWindow = await this.desktopRunner.getActiveWindow();
    if (!activeWindow) {
      throw await this.blockedAction("desktop", actionName, "No active window was available for desktop control.", {});
    }
    if (!isWindowAllowed(this.policy, activeWindow)) {
      throw await this.blockedAction(
        "desktop",
        actionName,
        `The active window ${activeWindow.title} is outside the allowlist.`,
        {
          activeWindow
        }
      );
    }
    return activeWindow;
  }

  private async captureScopeScreenshot(scope: "browser" | "desktop", label: string): Promise<string | undefined> {
    try {
      const result =
        scope === "browser"
          ? await this.browserRunner.captureScreenshot(label)
          : await this.desktopRunner.captureScreenshot(label);
      return typeof result.path === "string" ? result.path : undefined;
    } catch {
      return undefined;
    }
  }

  private async blockedAction(
    scope: "browser" | "desktop",
    name: string,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<Error> {
    const action = this.buildAction(scope, name, message, metadata);
    this.logger.log(this.createLogEntry("blocked", action, message));
    return new Error(message);
  }

  private createLogEntry(
    outcome: ActionLogEntry["outcome"],
    action: ActionDescriptor,
    message: string,
    details?: Record<string, unknown>
  ): ActionLogEntry {
    return {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      outcome,
      action,
      message,
      beforeScreenshotPath: typeof details?.beforeScreenshotPath === "string" ? details.beforeScreenshotPath : undefined,
      afterScreenshotPath: typeof details?.afterScreenshotPath === "string" ? details.afterScreenshotPath : undefined,
      details
    };
  }

  private logSystemEvent(
    outcome: ActionLogEntry["outcome"],
    name: string,
    message: string,
    details?: Record<string, unknown>
  ): void {
    this.logger.log(
      this.createLogEntry(
        outcome,
        {
          id: nanoid(),
          scope: "desktop",
          name,
          summary: message,
          sensitivity: "sensitive",
          metadata: details ?? {}
        },
        message,
        details
      )
    );
  }

  private async syncIndicator(): Promise<void> {
    this.writeIndicatorStatus();
    const activeLeases = this.sessions.getActive();
    if (activeLeases.length > 0) {
      this.startIndicator();
      return;
    }
    this.stopIndicator();
  }

  private writeIndicatorStatus(): void {
    const status = {
      active: this.sessions.getActive().length > 0,
      expiresAt: this.sessions
        .getActive()
        .map((lease) => lease.expiresAt)
        .sort()[0] ?? null,
      hotkey: "Ctrl+Alt+F12"
    };
    writeFileSync(this.paths.indicatorStatusFile, JSON.stringify(status, null, 2), "utf8");
  }

  private startIndicator(): void {
    if (this.indicatorProcess) {
      return;
    }
    if (!existsSync(this.paths.indicatorScript)) {
      return;
    }

    const child = spawn(
      "powershell.exe",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.paths.indicatorScript,
        "-StatusPath",
        this.paths.indicatorStatusFile,
        "-StopPath",
        this.paths.stopSignalFile
      ],
      {
        cwd: this.paths.root,
        windowsHide: false
      }
    );

    child.on("exit", () => {
      this.indicatorProcess = null;
    });

    this.indicatorProcess = child;
  }

  private stopIndicator(): void {
    if (!this.indicatorProcess) {
      return;
    }
    this.indicatorProcess.kill();
    this.indicatorProcess = null;
  }
}

export interface PendingApprovalResult {
  approvalId: string;
  actionId: string;
}
