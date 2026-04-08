import { nanoid } from "nanoid";

import type { ActionDescriptor, ApprovalDecision, ApprovalMode, PendingApproval } from "./types.js";

interface PendingApprovalRecord {
  approval: PendingApproval;
  resolve: (decision: ApprovalDecision) => void;
  timer: NodeJS.Timeout;
}

export class ApprovalManager {
  private readonly pending = new Map<string, PendingApprovalRecord>();

  public async requestApproval(
    action: ActionDescriptor,
    timeoutSeconds: number,
    recommendedMode: ApprovalMode
  ): Promise<ApprovalDecision> {
    const id = nanoid();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + timeoutSeconds * 1000);

    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({
          state: "expired",
          reason: "Approval request expired before the user approved it."
        });
      }, timeoutSeconds * 1000);

      this.pending.set(id, {
        approval: {
          id,
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          action,
          recommendedMode
        },
        resolve,
        timer
      });
    });
  }

  public decide(approvalId: string, decision: ApprovalDecision): PendingApproval {
    const record = this.pending.get(approvalId);
    if (!record) {
      throw new Error(`No pending approval found for ${approvalId}.`);
    }

    clearTimeout(record.timer);
    this.pending.delete(approvalId);
    record.resolve(decision);
    return record.approval;
  }

  public listPending(): PendingApproval[] {
    return [...this.pending.values()]
      .map((entry) => entry.approval)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}
