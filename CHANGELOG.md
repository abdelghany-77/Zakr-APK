# Changelog

## 2.1.0 - Unreleased

### Added

- Deterministic daily reminder schedule validation and versioned backup helpers.
- Native Android adhkar reminder alarms with persistent scheduling and reboot/timezone recovery.
- A daily local-midnight prayer refresh that re-fetches the current location schedule.
- Automated Node.js tests for local schedule generation, stable identifiers, duplicate prevention, and backup validation.

### Changed

- SafeStorage backup restore now validates the complete payload and rolls back partial writes.
- Prayer-time refreshes also request a native adhkar schedule reconciliation.
- Cached prayer times remain available offline while successful refreshes resynchronize native prayer and adhkar schedules.

### Verification

- JavaScript syntax checks, unit tests, and the web asset build pass.
- Android build verification is pending a configured JDK (`JAVA_HOME` is not available in the current environment).
- Real-device notification, OEM power-management, and tap-routing tests remain required.
