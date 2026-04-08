# Example GitHub Task Flow

## Scenario

An MCP client wants to review a GitHub pull request using browser automation without broad desktop control.

## Example Sequence

1. MCP client calls `browser_navigate` with a GitHub PR URL.
2. `GO TO WORK` checks the URL against the browser allowlist.
3. If no active browser lease exists, the action becomes a pending approval in the control UI.
4. User approves a 5-minute browser session.
5. The visible active-session indicator appears.
6. The daemon opens Chromium to the requested GitHub page.
7. The MCP client calls `browser_wait`, `browser_click`, `browser_fill`, or `browser_screenshot` as needed.
8. Sensitive actions like comment submit or settings pages trigger additional approval needs if they exceed the active lease sensitivity cap.
9. Audit entries and screenshots are written locally.
10. The session expires automatically or the user hits emergency stop.

## Why This Is Safer

- GitHub work stays in the browser path first.
- Desktop fallback is not used unless browser automation is insufficient.
- The user can see exactly when control is active.
- Broad filesystem access never becomes part of the workflow.
