import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { PolicyConfig } from "../core/types.js";
import type { ProjectPaths } from "../core/paths.js";

export class BrowserRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  public constructor(
    private readonly paths: ProjectPaths,
    private readonly policy: PolicyConfig
  ) {}

  public async navigate(url: string): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    await page.goto(url, {
      waitUntil: "domcontentloaded"
    });
    return {
      ok: true,
      url: page.url(),
      title: await page.title()
    };
  }

  public async click(selector: string): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    await page.locator(selector).first().click({ timeout: 15_000 });
    return {
      ok: true,
      selector,
      url: page.url()
    };
  }

  public async fill(selector: string, value: string): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    await page.locator(selector).first().fill(value, { timeout: 15_000 });
    return {
      ok: true,
      selector,
      url: page.url(),
      valueLength: value.length
    };
  }

  public async wait(selector: string | undefined, timeoutMs: number): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    if (selector) {
      await page.locator(selector).first().waitFor({ timeout: timeoutMs, state: "visible" });
      return {
        ok: true,
        selector,
        url: page.url()
      };
    }

    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
    return {
      ok: true,
      state: "networkidle",
      url: page.url()
    };
  }

  public async captureScreenshot(label = "browser"): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    const filename = resolve(this.paths.screenshotsDir, `${Date.now()}-${sanitizeLabel(label)}.png`);
    await page.screenshot({
      path: filename,
      fullPage: false
    });
    return {
      ok: true,
      path: filename,
      url: page.url()
    };
  }

  public async getCurrentUrl(): Promise<string | undefined> {
    return this.page?.url();
  }

  public async close(): Promise<void> {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  private async ensurePage(): Promise<Page> {
    if (this.page) {
      return this.page;
    }

    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.policy.browser.headless
      });
    }

    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1440, height: 900 }
      });
    }

    this.page = await this.context.newPage();
    return this.page;
  }
}

function sanitizeLabel(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "capture";
}
