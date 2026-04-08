import express, { type Request, type Response, type NextFunction } from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GoToWorkService } from "../core/service.js";
import { validateBearerToken } from "../core/auth.js";
import { RateLimiter } from "../core/rate-limit.js";

export async function createHttpServer(service: GoToWorkService) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/assets", express.static(service.paths.staticDir));

  // Auth middleware for action and mutation endpoints
  const requireAuth = (request: Request, response: Response, next: NextFunction): void => {
    if (!service.authSecret) {
      next();
      return;
    }

    if (!validateBearerToken(request.headers.authorization, service.authSecret)) {
      response.status(401).json({ ok: false, error: "Unauthorized. Provide a valid Bearer token." });
      return;
    }

    next();
  };

  app.get("/", (_request, response) => {
    response.type("html").send(readFileSync(resolve(service.paths.staticDir, "index.html"), "utf8"));
  });

  // Status and policy are open so the local control UI can render
  app.get("/api/status", (_request, response) => {
    response.json(service.getStatus());
  });

  app.get("/api/policy", (_request, response) => {
    response.json(service.policy);
  });

  app.post("/api/runtime/dry-run", (request, response) => {
    response.json(service.setDryRun(Boolean(request.body?.enabled)));
  });

  app.post("/api/runtime/auto-approve", (request, response) => {
    response.json(service.setAutoApprove(Number(request.body?.durationMinutes ?? 0)));
  });

  app.post("/api/emergency-stop", async (_request, response) => {
    await service.emergencyStop("Control UI");
    response.json({ ok: true });
  });

  app.post("/api/approvals/:approvalId/decision", (request, response) => {
    const approvalId = String(request.params.approvalId);
    const decision = request.body ?? {};
    const result = service.decideApproval(approvalId, {
      state: decision.state,
      mode: decision.mode,
      durationMinutes: decision.durationMinutes,
      reason: decision.reason
    });
    response.json({ ok: true, ...result });
  });

  // Rate limit: 60 action requests per minute
  const actionLimiter = new RateLimiter(60, 60_000);

  const rateLimit = (_request: Request, response: Response, next: NextFunction): void => {
    if (!actionLimiter.allow()) {
      response.status(429).json({ ok: false, error: "Rate limit exceeded. Try again shortly." });
      return;
    }
    next();
  };

  // All action endpoints require auth and are rate-limited
  app.use("/api/actions", requireAuth, rateLimit);

  app.post("/api/actions/browser/navigate", async (request, response) => {
    await respond(response, () => service.browserNavigate(String(request.body?.url ?? "")));
  });

  app.post("/api/actions/browser/click", async (request, response) => {
    await respond(response, () => service.browserClick(String(request.body?.selector ?? "")));
  });

  app.post("/api/actions/browser/fill", async (request, response) => {
    await respond(response, () =>
      service.browserFill(String(request.body?.selector ?? ""), String(request.body?.value ?? ""))
    );
  });

  app.post("/api/actions/browser/wait", async (request, response) => {
    await respond(response, () =>
      service.browserWait(
        typeof request.body?.selector === "string" ? request.body.selector : undefined,
        Number(request.body?.timeoutMs ?? 10_000)
      )
    );
  });

  app.post("/api/actions/browser/screenshot", async (request, response) => {
    await respond(response, () =>
      service.browserScreenshot(
        typeof request.body?.label === "string" ? request.body.label : undefined
      )
    );
  });

  app.post("/api/actions/desktop/list-windows", async (_request, response) => {
    await respond(response, () => service.desktopListWindows());
  });

  app.post("/api/actions/desktop/focus-window", async (request, response) => {
    await respond(response, () => service.desktopFocusWindow(String(request.body?.handle ?? "")));
  });

  app.post("/api/actions/desktop/mouse-move", async (request, response) => {
    await respond(response, () =>
      service.desktopMouseMove(Number(request.body?.x ?? 0), Number(request.body?.y ?? 0))
    );
  });

  app.post("/api/actions/desktop/mouse-click", async (request, response) => {
    await respond(response, () =>
      service.desktopMouseClick(request.body?.button === "right" ? "right" : "left")
    );
  });

  app.post("/api/actions/desktop/mouse-scroll", async (request, response) => {
    await respond(response, () => service.desktopMouseScroll(Number(request.body?.delta ?? 0)));
  });

  app.post("/api/actions/desktop/keyboard-text", async (request, response) => {
    await respond(response, () => service.desktopKeyboardText(String(request.body?.text ?? "")));
  });

  app.post("/api/actions/desktop/keyboard-key", async (request, response) => {
    await respond(response, () => service.desktopKeyboardKey(String(request.body?.key ?? "")));
  });

  app.post("/api/actions/desktop/keyboard-hotkey", async (request, response) => {
    const keys = Array.isArray(request.body?.keys) ? request.body.keys.map(String) : [];
    await respond(response, () => service.desktopKeyboardHotkey(keys));
  });

  app.post("/api/actions/desktop/screenshot", async (request, response) => {
    await respond(response, () =>
      service.desktopScreenshot(
        typeof request.body?.label === "string" ? request.body.label : undefined
      )
    );
  });

  return app;
}

async function respond(response: Response, handler: () => Promise<unknown>): Promise<void> {
  try {
    const result = await handler();
    response.json({
      ok: true,
      result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.status(400).json({
      ok: false,
      error: message
    });
  }
}
