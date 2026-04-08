# Distribution Checklist

## Release Hygiene

- pin and review dependency lockfile
- generate SBOM
- review third-party licenses
- sign binaries and installers
- verify startup, indicator, and emergency stop on clean Windows machines
- verify Playwright browser installation flow
- verify packaged control UI
- verify logs and screenshots stay inside app directories

## Safety Verification

- confirm blocked schemes like `file:` stay blocked
- confirm non-allowlisted domains are denied
- confirm non-allowlisted windows are denied
- confirm single approvals auto-expire
- confirm timed sessions auto-expire
- confirm emergency stop revokes active leases immediately

## Packaging Follow-Up

- MSI or signed installer
- upgrade strategy
- local config migration
- uninstall cleanup for app-owned runtime files only
