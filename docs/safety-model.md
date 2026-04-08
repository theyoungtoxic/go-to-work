# Safety Model

## Non-Negotiable Defaults

- explicit approval before control starts
- visible `AI CONTROL ACTIVE` indicator during active leases
- emergency stop via UI and `Ctrl+Alt+F12`
- session timeout with automatic lease expiry
- deny by default outside allowlisted domains, apps, and windows
- stronger scrutiny for sensitive actions
- audit logging for every attempt, including blocked and denied actions
- no stealth mode
- no persistence tricks

## Approval Model

Approvals can be granted as:
- `approve_once`
  - creates a short-lived single-action lease
- `approve_session`
  - creates a timed lease for one scope with a sensitivity cap

This keeps routine browser navigation usable without granting broad desktop control.

## Sensitive Action Handling

Sensitive or critical actions trigger stronger review signals:
- auth and security-oriented browser paths
- selectors mentioning password, token, delete, remove, or billing flows
- most desktop input actions

Where practical, before/after screenshots are captured into `runtime/screenshots`.

## File Access Boundary

This product intentionally does not expose arbitrary filesystem tools.

Allowed writes:
- app runtime folders
- app config
- app logs and screenshots

Not implemented:
- reading arbitrary user documents
- browsing downloads or desktop folders
- editing system files
- scanning app data or browser profiles
- credential collection

## Commercial Safety Position

The product is positioned as a user-controlled local tool, not a hidden operator. That makes explicit consent, visible activity, narrow scopes, and auditable behavior core product requirements rather than optional enterprise settings.
