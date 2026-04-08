# Testing Notes

## Automated Verification Completed On 2026-04-08

- `npm run build`
  - passed
- `npm test`
  - passed
  - 2 test files, 5 tests total

Covered by automated tests:
- browser allowlist enforcement
- blocked scheme enforcement
- sensitivity classification
- session single-use lease behavior
- timed lease sensitivity caps

## Live Verification Completed On 2026-04-08

- started the daemon successfully
- confirmed `GET /api/status` and `GET /` both responded
- installed Playwright Chromium successfully
- triggered a real pending approval for `browser_navigate`
- approved a timed browser session through the approval API
- confirmed navigation to `https://github.com/`
- confirmed browser before/after screenshots were written
- confirmed audit log entries for pending, approved, completed, and stopped actions
- triggered emergency stop and confirmed the active lease was revoked
- triggered a real pending approval for `desktop_list_windows`
- approved once and confirmed the desktop bridge returned allowlisted windows
- triggered `desktop_screenshot` and confirmed the screenshot file was written
- confirmed the active-session indicator helper process launched during a timed lease

## Verified Output Paths

- action logs: `runtime/logs/2026-04-08-actions.jsonl`
- browser screenshots:
  - `runtime/screenshots/1775631506895-navigate-before.png`
  - `runtime/screenshots/1775631508301-navigate-after.png`
- desktop screenshot:
  - `runtime/screenshots/1775631573487-verification.png`

## Manual Checks Still Worth Doing

- physically press `Ctrl+Alt+F12` to confirm the hotkey path on the target machine
- visually confirm the WinForms indicator window styling on the target machine
- exercise desktop focus and input actions against a deliberately approved app window
- package the app for installer-style distribution and verify clean install/uninstall behavior

## Known Practical Limitations

- Browser automation depends on local Playwright browser installation.
- The indicator and desktop runner require an interactive Windows session.
- Desktop text input uses Windows `SendKeys`, which is intentionally narrow and less robust than browser-native text entry.
