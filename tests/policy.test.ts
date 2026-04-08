import { describe, expect, it } from "vitest";

import { classifyBrowserSensitivity, compareSensitivity, isBrowserUrlAllowed } from "../src/core/policy.js";
import type { PolicyConfig } from "../src/core/types.js";

const policy: PolicyConfig = {
  general: {
    productName: "GO TO WORK",
    host: "127.0.0.1",
    port: 31337,
    dryRunDefault: false
  },
  session: {
    approvalTimeoutSeconds: 300,
    singleActionLeaseSeconds: 120,
    defaultTimedSessionMinutes: 10,
    maxTimedSessionMinutes: 30
  },
  workspaces: {
    approvedRoots: []
  },
  browser: {
    allowedDomains: ["github.com", "*.github.com"],
    blockedSchemes: ["file:", "about:"],
    headless: false,
    sensitivePathKeywords: ["login", "settings", "token"],
    sensitiveSelectorKeywords: ["password", "delete", "token"]
  },
  desktop: {
    enabled: true,
    allowlistedProcessNames: [],
    allowlistedWindowTitleKeywords: [],
    maxScrollTicks: 8,
    maxMouseTravelPixels: 4000
  },
  approvals: {
    strongerApprovalForSensitive: true,
    captureBeforeAfterScreenshots: true
  },
  logging: {
    maxRecentEntries: 100
  }
};

describe("policy", () => {
  it("allows allowlisted domains and blocks file URLs", () => {
    expect(isBrowserUrlAllowed(policy, "https://github.com/openai/openai")).toBe(true);
    expect(isBrowserUrlAllowed(policy, "file:///C:/secret.txt")).toBe(false);
    expect(isBrowserUrlAllowed(policy, "https://example.com")).toBe(false);
  });

  it("classifies sensitive paths and selectors", () => {
    expect(
      classifyBrowserSensitivity(policy, "navigate", { url: "https://github.com/settings/tokens" })
    ).toBe("critical");
    expect(
      classifyBrowserSensitivity(policy, "click", { selector: "button.delete-account" })
    ).toBe("sensitive");
  });

  it("orders sensitivity levels correctly", () => {
    expect(compareSensitivity("critical", "sensitive")).toBeGreaterThan(0);
    expect(compareSensitivity("normal", "critical")).toBeLessThan(0);
  });
});
