# GO TO WORK

**Give your AI agent eyes and hands on your computer.**

GO TO WORK is a local automation server that lets AI agents (like Claude) control your browser and desktop apps — with your explicit permission, every time.

It works by running a small local server on your machine. Your AI agent sends commands (click this, type that, take a screenshot) and GO TO WORK executes them — but only after you approve, and only on apps you've allowlisted.

---

## What Can It Do?

**Browser automation** (powered by Playwright):
- Navigate to URLs
- Click elements on a page
- Fill in form fields
- Wait for elements to load
- Take browser screenshots

**Desktop automation** (Windows):
- List and focus open windows
- Move and click the mouse
- Scroll
- Type text and press keys/hotkeys
- Take desktop screenshots

---

## Safety First

GO TO WORK is **deny-by-default**. Nothing happens unless:

1. The app/website is on your **allowlist** (you choose which apps and sites the agent can touch)
2. You **approve** the action (or turn on timed auto-approve when you're watching)
3. The server is **running locally** on your machine (nothing is exposed to the internet)

You also get:
- **Emergency stop** button + `Ctrl+Alt+F12` hotkey to kill all sessions instantly
- **Dry-run mode** to see what would happen without actually doing anything
- **Audit logging** of every action with before/after screenshots
- **A visible control indicator** on screen whenever a session is active

### Auto-Approve Safety Overrides

Even when you turn on auto-approve, certain actions **always require manual approval**:

- **Critical actions** — anything involving password fields, security tokens, or destructive buttons (delete, remove, publish, merge) will never be auto-approved
- **Sensitive browser pages** — login pages, billing, security settings, and token/key management pages are always flagged
- **System-critical desktop apps** — Task Manager, Registry Editor, PowerShell, Command Prompt, User Account Control, Windows Security, Device Manager, and other system tools always require your explicit approval — even during auto-approve sessions

These overrides are built into the engine and cannot be bypassed by the AI agent. You can customize the list of never-auto-approve processes and title keywords in your policy file under `neverAutoApproveProcesses` and `neverAutoApproveTitleKeywords`.

---

## Requirements

Before you start, make sure you have:

- **Windows 10 or 11**
- **Node.js 20 or newer** — [Download here](https://nodejs.org) if you don't have it
  - To check: open a terminal and run `node --version`
- **PowerShell** (comes with Windows — you already have it)
- **An MCP-compatible AI client** — like [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (CLI or VS Code extension)

---

## Setup (Step by Step)

### 1. Download or clone this project

Put the folder somewhere on your computer. For example: `C:\Users\YourName\Desktop\GO TO WORK`

### 2. Open a terminal in the project folder

You can:
- Right-click the folder and choose "Open in Terminal"
- Or open any terminal and `cd` to the folder:
  ```
  cd "C:\Users\YourName\Desktop\GO TO WORK"
  ```

### 3. Install dependencies

```
npm install
```

This downloads the libraries GO TO WORK needs. It may take a minute.

### 4. Install the browser engine

```
npm run install:browser
```

This downloads a Chromium browser that GO TO WORK uses for browser automation. It's separate from your personal Chrome/Edge — your browsing data is never touched.

### 5. Set up your policy (allowlists)

Copy the example policy to create your own:

```
cp config/example-policy.json config/default-policy.json
```

Now open `config/default-policy.json` in any text editor and customize it:

**Browser domains** — which websites can the agent visit?
```json
"allowedDomains": [
  "github.com",
  "*.github.com",
  "localhost",
  "127.0.0.1"
]
```
Add any sites you want. For example, to add Google Docs: `"docs.google.com"`

**Desktop apps** — which apps can the agent control?
```json
"allowlistedProcessNames": [
  "chrome.exe",
  "msedge.exe",
  "Code.exe",
  "WindowsTerminal.exe",
  "explorer.exe"
]
```
Add the `.exe` name of any app you want to allow. To find an app's process name, open Task Manager, find the app, right-click, and look at "Go to details."

**Window title keywords** — an extra safety layer (must match both process AND title):
```json
"allowlistedWindowTitleKeywords": [
  "Visual Studio Code",
  "Microsoft Edge",
  "Google Chrome",
  "Terminal",
  "Explorer"
]
```

### 6. Build the project

```
npm run build
```

This compiles the TypeScript source code into runnable JavaScript.

### 7. Start the server

```
npm run serve
```

You should see:
```
GO TO WORK server listening on http://127.0.0.1:31337
Auth secret: <a long random string>
Auth secret stored at: runtime/state/auth-secret.txt
```

**Keep this terminal open.** The server needs to stay running.

### 8. Open the control panel

Open your browser and go to: **http://127.0.0.1:31337**

This is your command center. From here you can:
- See the current status
- Approve or deny actions
- Turn on auto-approve (with a timer)
- Toggle dry-run mode
- Hit the emergency stop
- View the audit log

---

## Connecting to Claude Code

Claude Code talks to GO TO WORK through MCP (Model Context Protocol). You need to tell Claude Code where to find it.

### Option A: Global config (works everywhere)

Create or edit the file `~/.mcp.json` (that's `C:\Users\YourName\.mcp.json`):

```json
{
  "mcpServers": {
    "go-to-work": {
      "command": "node",
      "args": ["C:/Users/YourName/Desktop/GO TO WORK/dist/mcp-cli.js"],
      "env": {
        "GTW_HOME": "C:/Users/YourName/Desktop/GO TO WORK"
      }
    }
  }
}
```

**Important:** Replace `YourName` with your actual Windows username. Use forward slashes `/` in the paths, not backslashes.

### Option B: Project-level config

Create a `.mcp.json` file in your project's root folder with the same contents as above. This scopes it to just that project.

### After configuring

Restart Claude Code. You should see the GO TO WORK tools appear. Try asking Claude:

> "Use GO TO WORK to take a screenshot of my desktop"

It will call the `desktop_screenshot` tool. Check the control panel — you'll see the approval request waiting for you.

---

## How It Works (The Flow)

Here's what happens when your AI agent wants to do something:

```
Agent sends command (e.g. "click this button")
        |
        v
GO TO WORK server receives it
        |
        v
Policy check: Is this app/site allowed?
    NO --> Blocked. Agent gets an error.
    YES --> Continue
        |
        v
Approval check: Is there an active session?
    YES --> Execute immediately
    NO  --> Send approval request to control panel
             |
             v
        You approve or deny in the UI
             |
             v
        If approved --> Execute
        If denied   --> Agent gets an error
```

---

## Available Tools

Once connected, your AI agent can use these 15 tools:

| Tool | What it does |
|------|-------------|
| `gtw_status` | Check server status, active sessions, and policy |
| `browser_navigate` | Open a URL in the Playwright browser |
| `browser_click` | Click an element by CSS selector |
| `browser_fill` | Type into a form field |
| `browser_wait` | Wait for an element or page load |
| `browser_screenshot` | Screenshot the browser |
| `desktop_list_windows` | List all allowlisted open windows |
| `desktop_focus_window` | Bring a window to the front |
| `desktop_mouse_move` | Move the cursor to coordinates |
| `desktop_mouse_click` | Left or right click |
| `desktop_mouse_scroll` | Scroll up or down |
| `desktop_keyboard_text` | Type a string of text |
| `desktop_keyboard_key` | Press a single key (Enter, Tab, etc.) |
| `desktop_keyboard_hotkey` | Press a key combo (Ctrl+S, Alt+F4, etc.) |
| `desktop_screenshot` | Screenshot the entire desktop |

---

## Tips and Tricks

### Auto-approve for hands-free work

If you're watching and want the agent to work without you clicking "approve" every time:
1. Open the control panel (http://127.0.0.1:31337)
2. Set **Auto-Approve** to 15m, 30m, or 1hr
3. It automatically expires — you don't have to remember to turn it off

### Dry-run mode for testing

Toggle **Dry Run** in the control panel. The agent will go through the full flow (policy checks, approvals) but nothing actually happens on screen. Great for testing your setup.

### Adding a new app

Want the agent to control a new app (like Godot, Photoshop, etc.)?

1. Open Task Manager and find the app's process name (e.g. `Godot_v4.6.2-stable_win64.exe`)
2. Add it to `allowlistedProcessNames` in your `config/default-policy.json`
3. Add a window title keyword too (e.g. `"Godot"`)
4. Rebuild and restart: `npm run build && npm run serve`

### Actions that are never auto-approved

Even with auto-approve on, these always require manual approval:
- Clicking delete/remove/publish/merge buttons in the browser
- Visiting login, billing, or security pages
- Interacting with Task Manager, Registry Editor, PowerShell, CMD, or any system admin tool

You can customize this list in your policy under `neverAutoApproveProcesses` and `neverAutoApproveTitleKeywords`.

### Emergency stop

If anything goes wrong:
- Click **Emergency Stop** in the control panel, OR
- Press **Ctrl+Alt+F12** anywhere on your desktop
- This instantly kills all active sessions and disables auto-approve

---

## Troubleshooting

**"GO TO WORK service is not running"**
The server isn't started. Run `npm run serve` in a terminal.

**"The active window is outside the allowlist"**
The app you're trying to control isn't in your policy. Add its process name and a title keyword to `config/default-policy.json`, then rebuild and restart.

**"Blocked navigation to [URL]"**
The website isn't in your `allowedDomains` list. Add it to your policy.

**Browser automation isn't working**
Make sure you ran `npm run install:browser`. If it still fails, try deleting `node_modules` and running `npm install` and `npm run install:browser` again.

**Claude Code doesn't see the tools**
- Make sure the paths in your `.mcp.json` are correct (use forward slashes)
- Make sure you ran `npm run build` (Claude Code needs the `dist/` folder)
- Make sure the server is running (`npm run serve`)
- Restart Claude Code after changing `.mcp.json`

**Actions time out waiting for approval**
Open the control panel and approve the pending action, or turn on auto-approve.

---

## Project Structure

```
GO TO WORK/
  config/
    default-policy.json     <-- Your personal allowlists (not committed)
    example-policy.json     <-- Template to copy from
  dist/                     <-- Compiled JS (generated by npm run build)
  docs/                     <-- Architecture and safety documentation
  runtime/
    logs/                   <-- Audit logs (auto-generated)
    screenshots/            <-- Before/after screenshots (auto-generated)
    state/                  <-- Session state and auth secret (auto-generated)
  scripts/
    windows/                <-- PowerShell helpers for desktop automation
  src/
    api/                    <-- HTTP server and routes
    automation/             <-- Browser and desktop runners
    core/                   <-- Policy, auth, sessions, approvals, logging
    mcp/                    <-- MCP client that talks to the HTTP server
    static/                 <-- Control panel UI (HTML/CSS/JS)
    server.ts               <-- Main server entry point
    mcp-cli.ts              <-- MCP stdio entry point
  tests/                    <-- Test files
  package.json
  tsconfig.json
```

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run install:browser` | Install Playwright Chromium |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run serve` | Start the GO TO WORK server |
| `npm run mcp` | Start the MCP stdio server (used by Claude Code) |
| `npm run dev:server` | Start server in dev mode (no build needed) |
| `npm run dev:mcp` | Start MCP in dev mode (no build needed) |
| `npm test` | Run tests |

---

## License

This project is currently unlicensed (proprietary). See the docs folder for licensing and distribution notes.
