# Architecture Notes

## Core Shape

`GO TO WORK` is split into three runtime layers:

1. Local daemon
   - Express-based HTTP service on `127.0.0.1:31337`
   - owns policy loading, approvals, active leases, logging, screenshots, and emergency stop handling

2. Automation runners
   - browser runner: Playwright Chromium, visible by default
   - desktop runner: PowerShell + Win32 bridge for limited fallback actions only

3. Interfaces
   - local browser UI for approvals and status
   - stdio MCP server that forwards requests into the daemon

## Why This Split

- The MCP wrapper stays thin and model-agnostic.
- The control UI and the MCP client share the same backend state.
- Approval gating is centralized instead of re-implemented per interface.
- Commercial packaging can later swap the UI shell without rewriting the safety model.

## Safety-Critical Flow

Every action flows through the same guard sequence:

1. Build an action descriptor with scope, summary, metadata, and sensitivity.
2. Validate deny-by-default policy boundaries.
3. Check for an already active control lease.
4. If needed, create a pending approval and wait.
5. Start or maintain the visible active-session indicator.
6. Capture before/after screenshots for sensitive actions when practical.
7. Execute or simulate the action.
8. Write an audit log entry.
9. Revoke single-use leases automatically.

## Browser Layer

Browser automation is the preferred path for:
- GitHub workflows
- docs sites
- dashboards
- internal web apps

Capabilities:
- navigate
- click
- fill
- wait
- screenshot

Guard rails:
- domain allowlist
- blocked schemes like `file:` and browser-internal URLs
- sensitivity escalation for auth, settings, billing, tokens, delete, and submit-style flows

## Desktop Layer

Desktop automation is intentionally narrow:
- list windows
- focus allowlisted windows
- mouse move, click, scroll
- keyboard text, key, hotkey
- screenshot

Boundaries:
- no arbitrary file browsing
- no background stealth control
- no privileged escalation
- no screen scraping outside explicit action use
- no general remote desktop feature set

## Runtime Data

The product writes only inside its own runtime folders:
- `runtime/logs`
- `runtime/screenshots`
- `runtime/state`
- `runtime/temp`

Approved workspace paths can exist in policy for future narrow integrations, but this implementation does not expose filesystem tools.
