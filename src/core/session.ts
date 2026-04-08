import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { nanoid } from "nanoid";

import { compareSensitivity } from "./policy.js";
import { ensureParentDirectory } from "./paths.js";
import type { ActionDescriptor, ControlLease, Scope, Sensitivity } from "./types.js";

export class SessionManager {
  private readonly leases = new Map<string, ControlLease>();
  private persistPath: string | null = null;

  public enablePersistence(filePath: string): void {
    this.persistPath = filePath;
    this.loadFromDisk();
  }

  public grantSingleActionLease(
    action: ActionDescriptor,
    lifetimeSeconds: number,
    sourceApprovalId?: string
  ): ControlLease {
    return this.insertLease({
      id: nanoid(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + lifetimeSeconds * 1000).toISOString(),
      scope: action.scope,
      sensitivityCap: action.sensitivity,
      mode: "single",
      sourceApprovalId,
      allowedActionIds: [action.id],
      summary: `Single action approval for ${action.summary}`
    });
  }

  public grantTimedLease(
    scope: Scope,
    sensitivityCap: Sensitivity,
    durationMinutes: number,
    summary: string,
    sourceApprovalId?: string
  ): ControlLease {
    return this.insertLease({
      id: nanoid(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
      scope,
      sensitivityCap,
      mode: "timed",
      sourceApprovalId,
      summary
    });
  }

  public getActive(): ControlLease[] {
    this.pruneExpired();
    return [...this.leases.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  public canRun(action: ActionDescriptor): boolean {
    this.pruneExpired();
    return [...this.leases.values()].some((lease) => {
      if (lease.allowedActionIds?.includes(action.id)) {
        return true;
      }
      return (
        lease.scope === action.scope &&
        compareSensitivity(lease.sensitivityCap, action.sensitivity) >= 0
      );
    });
  }

  public consumeSingleUseLeases(actionId: string): void {
    for (const [leaseId, lease] of this.leases.entries()) {
      if (lease.mode === "single" && lease.allowedActionIds?.includes(actionId)) {
        this.leases.delete(leaseId);
      }
    }
    this.saveToDisk();
  }

  public revokeAll(): ControlLease[] {
    const active = this.getActive();
    this.leases.clear();
    this.saveToDisk();
    return active;
  }

  public pruneExpired(): void {
    const sizeBefore = this.leases.size;
    const now = Date.now();
    for (const [leaseId, lease] of this.leases.entries()) {
      if (Date.parse(lease.expiresAt) <= now) {
        this.leases.delete(leaseId);
      }
    }
    if (this.leases.size !== sizeBefore) {
      this.saveToDisk();
    }
  }

  private insertLease(lease: ControlLease): ControlLease {
    this.leases.set(lease.id, lease);
    this.saveToDisk();
    return lease;
  }

  private saveToDisk(): void {
    if (!this.persistPath) {
      return;
    }
    try {
      const data = JSON.stringify([...this.leases.values()], null, 2);
      writeFileSync(this.persistPath, data, "utf8");
    } catch {
      // Non-fatal: persistence is best-effort
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) {
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(this.persistPath, "utf8")) as ControlLease[];
      const now = Date.now();
      for (const lease of raw) {
        if (Date.parse(lease.expiresAt) > now) {
          this.leases.set(lease.id, lease);
        }
      }
    } catch {
      // Non-fatal: if the file is corrupt, start fresh
    }
  }
}
