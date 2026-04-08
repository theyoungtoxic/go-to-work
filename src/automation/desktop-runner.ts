import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ProjectPaths } from "../core/paths.js";
import type { PolicyConfig, WindowInfo } from "../core/types.js";

const execFileAsync = promisify(execFile);

export class DesktopRunner {
  public constructor(
    private readonly paths: ProjectPaths,
    private readonly policy: PolicyConfig
  ) {}

  public dispose(): void {
    void this.policy;
  }

  public async listWindows(): Promise<WindowInfo[]> {
    const result = await this.invoke("list_windows", {});
    return Array.isArray(result.windows) ? (result.windows as WindowInfo[]) : [];
  }

  public async getActiveWindow(): Promise<WindowInfo | undefined> {
    const result = await this.invoke("get_active_window", {});
    return result.window as WindowInfo | undefined;
  }

  public async focusWindow(windowHandle: string): Promise<Record<string, unknown>> {
    return this.invoke("focus_window", { handle: windowHandle });
  }

  public async mouseMove(x: number, y: number): Promise<Record<string, unknown>> {
    return this.invoke("mouse_move", { x, y });
  }

  public async mouseClick(button: "left" | "right"): Promise<Record<string, unknown>> {
    return this.invoke("mouse_click", { button });
  }

  public async mouseScroll(delta: number): Promise<Record<string, unknown>> {
    return this.invoke("mouse_scroll", { delta });
  }

  public async keyboardText(text: string): Promise<Record<string, unknown>> {
    return this.invoke("keyboard_text", { text });
  }

  public async keyboardKey(key: string): Promise<Record<string, unknown>> {
    return this.invoke("keyboard_key", { key });
  }

  public async keyboardHotkey(keys: string[]): Promise<Record<string, unknown>> {
    return this.invoke("keyboard_hotkey", { keys });
  }

  public async captureScreenshot(label = "desktop"): Promise<Record<string, unknown>> {
    return this.invoke("screenshot", { label, screenshotsDir: this.paths.screenshotsDir });
  }

  private async invoke(command: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.paths.desktopBridgeScript,
        "-Command",
        command,
        "-PayloadJson",
        JSON.stringify(payload)
      ],
      {
        cwd: this.paths.root,
        maxBuffer: 10 * 1024 * 1024
      }
    );

    const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
    if (!parsed.ok) {
      throw new Error(typeof parsed.error === "string" ? parsed.error : `Desktop bridge failed for ${command}.`);
    }
    return parsed;
  }
}
