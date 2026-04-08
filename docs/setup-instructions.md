# Setup Instructions

## Requirements

- Windows 10 or 11
- Node.js 20+
- PowerShell 5.1+ or PowerShell 7 with `powershell.exe` available

## Install

```powershell
npm install
npm run install:browser
```

If Playwright browser installation is blocked by network restrictions, the daemon and UI can still start, but browser automation will fail until Chromium is installed.

## Run The Daemon

```powershell
npm run dev:server
```

This starts:
- the local HTTP API
- the local control UI
- approval handling
- audit logging
- emergency-stop monitoring

## Run The MCP Server

In a separate terminal:

```powershell
npm run dev:mcp
```

Point your MCP-compatible client at the stdio process.

## Build For Release

```powershell
npm run build
```

Then run:

```powershell
npm run serve
npm run mcp
```

## Local Policy Overrides

Optional local overrides belong in:

`config/local-policy.json`

Recommended use:
- narrow browser domain additions
- narrow desktop app allowlist changes
- explicit workspace approvals if future features need them

Do not use policy overrides to weaken the default deny posture.
