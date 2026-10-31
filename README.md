# opencode-muse-auth

Muse Code subscription sign-in for opencode

[![CI](https://github.com/TheStreamCode/opencode-muse-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/opencode-muse-auth/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/opencode-muse-auth)](https://www.npmjs.com/package/opencode-muse-auth)

opencode plugin that registers the **Muse Code subscription** login method for the built-in `meta`
provider: no API key to copy, no third-party CLI to install. On the V2 plugin API it also routes
subscription inference through a local wire adapter that keeps requests compatible with Muse Code's
tool declarations; see [ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md). A successful login still does not
guarantee model access: Meta may reject or restrict this use.

> **Unofficial and experimental.** This plugin uses a Muse Code subscription credential from
> opencode. Meta's terms limit that credential to Muse Code, so this use may not be supported and
> Meta may suspend or revoke accounts or credentials. Use it at your own risk; the authors cannot
> recover an account. Read [DISCLAIMER.md](DISCLAIMER.md) before installing.

## Install

Add the plugin to `opencode.json`; opencode installs it from npm:

```jsonc
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-muse-auth"]
}
```

## Quick start

1. Run `/connect` in opencode.
2. Pick the `meta` provider and the **Muse Code subscription** method.
3. Open the printed Meta device page, enter the code, and approve the login in your
   browser; it completes by itself.
4. Select a `muse-*` model from the `meta` provider, for example `meta/muse-spark-1.3`.
   Inference goes through the local adapter on the V2 plugin API.

The plugin mints a stable, account-bound inference key for opencode; the OAuth access token
stays in memory and is never written to disk.

## Features

- Registers an `auth` hook for the built-in `meta` provider (no separate provider id to
  configure) and runs the Meta device-code exchange (RFC 8628) inside `/connect`, then mints
  the subscription inference key through the Model API.
- Routes through the Responses API; the `meta.txt` system prompt applies automatically to `muse-*`
  model ids.
- Runs a loopback wire adapter for the V2 plugin API that aliases client tool names colliding
  with Muse Code's builtins, restores them in responses, and normalizes parameters Meta rejects
  (`tool_choice`, reasoning effort, output-token floor, encrypted-reasoning include). The
  adapter's `/v1` origin becomes the per-request base URL, with the assembled request rewritten
  onto it where the override is ignored. All `meta` connections use the adapter regardless of
  credential type; the OAuth token overrides `Authorization` only while the V2 sign-in is
  active. On refusal the adapter retries once with every tool aliased.
  See [ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md).
- Stores the credential in the OpenCode auth store (V1) or integration store (V2); the V1
  loader falls back to the legacy cache only when the store has no key, and V2 writes no
  local cache.
- Never re-mints on its own; re-run `/connect` only after a 401, because the mint endpoint is
  aggressively rate-limited.
- Flow parameters are compatible with the published behavior of oh-my-pi (MIT); see [NOTICE](NOTICE)
  and [AUTH_CONTRACT.md](AUTH_CONTRACT.md).

## Requirements

- opencode 2.2.4 or newer for inference through the adapter (the V2 plugin module shape; 2.2.0
  loads the plugin without invoking its setup). On the V1 plugin API the plugin still
  authenticates but keeps receiving Meta's `client_attestation_denied` 403.
- Node.js 22.6 or newer for development (CI runs 22 and 24).
- An active Muse Code subscription on the Meta account used at login.

## Configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `plugins` entry in `opencode.json` | Loads the plugin. | not set |
| Auth store | Credential storage read by the V1 loader. | `~/.local/share/opencode/auth.json` |
| Legacy cache | Read-only fallback from earlier versions. | `~/.config/opencode/muse-code-sub.json` |
| `/connect` method | Selects the Muse Code subscription login. | `meta` provider |
| `MUSE_CODE_ADAPTER` | `off` keeps the local proxy but disables reshaping and normalization. | unset |

## Privacy and security

opencode holds the inference key in the V1 auth store or the V2 integration store. The
legacy cache, when present, stores only `apiKey`, `accountId`, and `email`; the OAuth access token
is never written to disk. The plugin contacts only `auth.meta.com` for the device login and
`api.meta.ai` for key minting and inference. The V2 wire adapter listens on `127.0.0.1` only,
forwards `Authorization` unchanged, and never reads, stores or logs credentials or bodies.
See [SECURITY.md](SECURITY.md) for vulnerability reporting and
[ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md) for the inference wire rules.

To remove access:

- disconnect the provider or log out in opencode (the store is
  `~/.local/share/opencode/auth.json`);
- delete `~/.config/opencode/muse-code-sub.json` if an older version created it;
- run `muse logout` to also clear the Muse Code CLI session;
- remove `opencode-muse-auth` from `opencode.json`.

## Troubleshooting

### `/connect` shows no Muse Code subscription method

The plugin is not loaded. Check the `opencode.json` syntax, the plugin name spelling, and the
package installation, then restart opencode.

### Requests fail with 401 or access was revoked

A 401 may indicate a rotated or revoked key. Re-run `/connect` once; the plugin never re-mints on
its own.

### Meta rejects subscription requests from this client

Meta may return a 403 mentioning `client_attestation_denied`, or that Muse Code subscriptions cover
the Muse Code client only. With the V2 adapter running this should not happen for colliding tool
names. If it appears anyway, one of these is true:

- the adapter could not bind its loopback port; opencode's log records
  `the local request adapter could not start` and the provider stays on the direct endpoint;
- `MUSE_CODE_ADAPTER=off` is set, which keeps the proxy but disables the reshaping;
- you are on the V1 plugin API, which has no adapter, or on a plugin or opencode release
  that predates the adapter wiring: first-generation adapter releases skipped plain `meta`
  API-key credentials, and early opencode V2 hosts load the plugin without invoking its V2
  setup. Check `opencode plugin list` and `opencode --version`, then update;
- Meta changed the gate, for example to a real per-client signature. Nothing in this plugin can
  forge one.

This is a client restriction, not an expired key, so signing in again does not remove it.
Use Muse Code for the subscription, or a separate pay-as-you-go Meta Model API key for other
clients, subject to Meta's terms.

### The login times out or is denied

Approve the printed code before the flow expires, then retry. A Meta rejection usually means the
account has no active Muse Code subscription.

### A legacy cache file is still present

Harmless: the V1 loader prefers the OpenCode auth store and reads the cache only when the store
has no key. Delete the file when migrating to V2 storage.

## Development

```bash
git clone https://github.com/TheStreamCode/opencode-muse-auth.git
cd opencode-muse-auth
npm install
npm run build
npm test
```

`npm test` builds with `tsc` and runs the TypeScript suite with the Node test runner. CI runs
the same gate on Node.js 22 and 24; Node 22 needs 22.6 or newer for test-runner type stripping.
The suite needs no Meta account.

## Support

Usage questions belong in GitHub Discussions; reproducible defects in GitHub Issues via the
bug report form. See [SUPPORT.md](SUPPORT.md). Problems in opencode or Meta belong to their
respective projects.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests must pass the required CI checks.

## License

MIT — see [`LICENSE`](LICENSE). The software is provided "as is"; see
[DISCLAIMER.md](DISCLAIMER.md) for the risk notice and liability terms.

---

Maintained by [Michael Gasperini (Mikesoft)](https://mikesoft.it).
If this project is useful to you, consider
[sponsoring its maintenance](https://github.com/sponsors/TheStreamCode).
