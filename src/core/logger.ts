import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ActionLogEntry } from "./types.js";
import type { ProjectPaths } from "./paths.js";
import { ensureParentDirectory } from "./paths.js";

export class AuditLogger {
  private readonly recent: ActionLogEntry[] = [];

  public constructor(
    private readonly paths: ProjectPaths,
    private readonly maxRecentEntries: number
  ) {}

  public log(entry: ActionLogEntry): void {
    const filename = resolve(this.paths.logsDir, `${entry.timestamp.slice(0, 10)}-actions.jsonl`);
    ensureParentDirectory(filename);
    appendFileSync(filename, `${JSON.stringify(entry)}\n`, "utf8");

    this.recent.unshift(entry);
    if (this.recent.length > this.maxRecentEntries) {
      this.recent.length = this.maxRecentEntries;
    }
  }

  public getRecent(limit = 50): ActionLogEntry[] {
    return this.recent.slice(0, limit);
  }
}
