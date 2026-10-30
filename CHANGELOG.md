# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.2] - 2026-10-30

### Documented

- Troubleshooting now names the versions that matter: 0.5.1 or newer is required because 0.5.0
  skipped the adapter for a plain `meta` API key, and opencode 2.2.4 or newer is required because
  2.2.0 loads the plugin without invoking its V2 setup.

## [0.5.1] - 2026-10-30

### Fixed

- Inference routing no longer depends on the V2 Muse OAuth credential: every `meta` request now goes
  through the loopback adapter, so an existing `meta` API key keeps working after the update. The
  V2 OAuth token is still used to override `Authorization` when that sign-in is active.
- Documented that the adapter requires the V2 plugin module shape, invoked by opencode 2.2.4 or
  newer; 2.2.0 loads the plugin but does not call its setup.

## [0.5.0] - 2026-10-30

### Added

- Local loopback wire adapter for the V2 plugin API. It aliases only the client tool names that
  collide with the 40-name Muse builtin set pinned in `ADAPTER_CONTRACT.md` (goal, cron, session
  and patch families included), restores them in streaming and JSON responses, and normalizes
  `tool_choice`, reasoning effort, the output-token floor and the encrypted-reasoning include.
  Subscription inference now uses the adapter's `/v1` origin as its base URL, so requests no longer
  fail with HTTP 403 `client_attestation_denied`. If the gate still refuses, the adapter retries
  once with every tool aliased.
- `ADAPTER_CONTRACT.md` pins the wire rules and the measured gate trigger; `ADAPTER_VERSION` is
  the matching code constant.
- `MUSE_CODE_ADAPTER=off` disables the reshaping while keeping the loopback proxy, so no endpoint
  goes stale.

### Quality of service

- The adapter binds `127.0.0.1` only, on the first free port of `43219`-`43222`, then an ephemeral
  port. Paths other than the Responses and Chat completion paths are relayed untouched, and SSE is
  streamed line by line. If the adapter cannot bind, the plugin logs the failure and leaves the
  provider on the direct endpoint.
- The V2 request rewrite is idempotent and scoped to the active Muse Code subscription; a
  pay-as-you-go `meta` key or another connection keeps its endpoint.

### Security

- The adapter forwards `Authorization` unchanged and never reads, stores or logs credentials,
  request bodies or response bodies. The plugin reshapes tool declarations only to match the Muse
  Code wire format after Meta's 2026-10-29 client restriction; it forges no credential, token or
  signature. Meta may treat the reshaping as a violation of its terms, and subscription revocation
  remains possible at any time; see [DISCLAIMER.md](DISCLAIMER.md).

### Changed

- Working inference now requires the V2 plugin API (opencode 2.x). The V1 `server()` export keeps
  authenticating but still receives Meta's 403.
- Package description and `files` mention the adapter and its contract document.

## [0.4.1] - 2026-10-30

### Fixed

- Device login keeps polling through transient network failures and unreadable token responses until
  the device code expires, instead of aborting on the first blip. Terminal OAuth errors still stop
  the flow immediately.

### Changed

- Documented that a successful sign-in does not guarantee model access, and that Meta's
  client-restriction 403 is not an expired key.

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

[0.5.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.5.0
[0.4.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.4.0
[0.3.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.3.0
[0.2.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.2.0
[0.1.2]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.1.2
[0.1.1]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.1.1
[0.1.0]: https://github.com/TheStreamCode/opencode-muse-auth/releases/tag/v0.1.0
