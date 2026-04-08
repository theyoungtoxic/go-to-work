# Licensing Strategy

## Current Repository State

- source marked `UNLICENSED`
- intended for proprietary commercial release
- internal third-party product positioning

## Recommended Commercial Strategy

- keep the core product proprietary
- maintain a software bill of materials for all third-party dependencies
- pin dependency versions through lockfiles before release builds
- publish separate customer-facing terms for local automation, consent, and supported environments

## Dependency Posture

This implementation favors mainstream dependencies with broad commercial usage:
- Playwright
- Express
- Zod
- MCP SDK

Before release, legal review should confirm the exact dependency versions shipped in the lockfile and any bundled browser assets.
