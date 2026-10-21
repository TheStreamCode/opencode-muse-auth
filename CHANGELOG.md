# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-10-21

### Added

- `AUTH_CONTRACT.md` pins the shared device-flow contract.

### Changed

- The V1 loader prefers the OpenCode auth store and falls back to the legacy cache only when the
  store has no key.
- Login failures are logged without sensitive data, and V2 errors surface a descriptive message.
- Credential records use a realistic expiry.
- V1 and V2 credential storage and key removal are documented.

## [0.3.0] - 2026-10-14

### Added

- Muse Code subscription auth registered through the OpenCode V2 `setup()` entry point.
- Root `index.js` entry point for local directory installs and the `@opencode/plugin` v2 runtime
  dependency.

## [0.2.0] - 2026-10-11

### Added

- Default export `{ id, server, setup() }`, accepted by opencode 1.18.29+ and 2.x.

### Fixed

- Startup `PluginModule.LoadError` on opencode 2.x: plugins are loaded from the module default
  export, and v1 named exports are no longer accepted.

### Changed

- `@opencode-ai/plugin` devDependency aligned to the v2 types.

## [0.1.2] - 2026-09-27

### Security

- The credential cache no longer persists the Meta OAuth access token; it stores `apiKey`,
  `accountId`, and `email` only. Re-run `/connect` to refresh caches written by earlier versions.

### Changed

- Release automation, Dependabot configuration, and community files added.

## [0.1.1] - 2026-09-22

### Added

- Muse Spark in opencode billed to the Muse Code monthly subscription through Meta device-code
  login; the credential is cached owner-only and no API key is required.

## [0.1.0] - 2026-09-16

### Added

- Initial `meta` provider auth hook for opencode: Meta device login, account-bound inference key,
  and Responses API transport.

[0.4.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.4.0
[0.3.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.3.0
[0.2.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.2.0
[0.1.2]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.1.2
[0.1.1]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.1.1
[0.1.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.1.0
