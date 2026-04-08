import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import type { ProjectPaths } from "./paths.js";
import { ensureParentDirectory } from "./paths.js";

let cachedSecret: string | null = null;

export function loadOrCreateSecret(paths: ProjectPaths): string {
  if (cachedSecret) {
    return cachedSecret;
  }

  if (existsSync(paths.authSecretFile)) {
    cachedSecret = readFileSync(paths.authSecretFile, "utf8").trim();
    if (cachedSecret.length > 0) {
      return cachedSecret;
    }
  }

  ensureParentDirectory(paths.authSecretFile);
  cachedSecret = randomBytes(32).toString("hex");
  writeFileSync(paths.authSecretFile, cachedSecret, "utf8");
  return cachedSecret;
}

export function validateBearerToken(
  authHeader: string | undefined,
  secret: string
): boolean {
  if (!authHeader) {
    return false;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return false;
  }

  return parts[1] === secret;
}
