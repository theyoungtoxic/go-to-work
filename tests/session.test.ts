import { describe, expect, it } from "vitest";

import { SessionManager } from "../src/core/session.js";
import type { ActionDescriptor } from "../src/core/types.js";

describe("session manager", () => {
  it("allows single action leases for the approved action only", () => {
    const manager = new SessionManager();
    const action: ActionDescriptor = {
      id: "action-1",
      scope: "browser",
      name: "navigate",
      summary: "Navigate to GitHub",
      sensitivity: "sensitive",
      metadata: {}
    };

    manager.grantSingleActionLease(action, 120);
    expect(manager.canRun(action)).toBe(true);

    manager.consumeSingleUseLeases("action-1");
    expect(manager.canRun(action)).toBe(false);
  });

  it("allows timed scope leases up to the approved sensitivity", () => {
    const manager = new SessionManager();
    manager.grantTimedLease("desktop", "sensitive", 10, "Desktop session");

    const allowed: ActionDescriptor = {
      id: "a",
      scope: "desktop",
      name: "mouse_move",
      summary: "Move mouse",
      sensitivity: "sensitive",
      metadata: {}
    };

    const blocked: ActionDescriptor = {
      id: "b",
      scope: "desktop",
      name: "keyboard_hotkey",
      summary: "Press destructive hotkey",
      sensitivity: "critical",
      metadata: {}
    };

    expect(manager.canRun(allowed)).toBe(true);
    expect(manager.canRun(blocked)).toBe(false);
  });
});
