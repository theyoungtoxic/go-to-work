# Product Brief

## Working Name

`GO TO WORK`

## One-Line Positioning

Local agent automation for browsers and desktops, under explicit user control.

## Product Scope

Primary use cases:
- GitHub workflows
- docs and dashboard tasks
- repetitive browser-based admin work
- desktop fallback for approved apps and windows

Non-goals:
- hidden remote control
- credential scraping
- MFA bypass
- UAC bypass
- stealth persistence
- surveillance tooling
- consumer spyware features

## Product Principles

- browser-first, not coordinate-first
- local-first by default
- user remains in control
- approvals are explicit
- logs are visible
- sessions expire automatically
- actions should be explainable after the fact

## Product Shape

Recommended architecture:
- `engine`: local automation service
- `browser-runner`: Playwright-backed browser actions
- `desktop-runner`: Windows automation fallback
- `mcp-server`: tool surface for AI clients
- `control-ui`: approval, status, kill switch, and audit view

## Suggested Initial Packaging

- Desktop app for Windows
- Local background service
- MCP adapter bundled with the app
- Optional CLI for local testing

## Commercial Positioning

`GO TO WORK` should be sold as a productivity and agent-enablement tool, not as a hacking, scraping, or stealth-control utility.
