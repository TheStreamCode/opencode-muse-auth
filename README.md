# opencode-muse-auth

Muse Code subscription sign-in for opencode

[![CI](https://github.com/TheStreamCode/opencode-muse-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/opencode-muse-auth/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/opencode-muse-auth)](https://www.npmjs.com/package/opencode-muse-auth)

opencode plugin that registers the **Muse Code subscription** login method for the built-in `meta`
provider. No API key to copy and no third-party CLI to install. On the V2 plugin API the plugin also
routes subscription inference through a local wire adapter that keeps requests compatible with Muse
Code's tool declarations; see [ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md). A successful login still
does not guarantee model access: Meta may reject or restrict this use.

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

## Sign in

1. Run `/connect` in opencode.
2. Pick the `meta` provider and the **Muse Code subscription** method.
3. Open the printed Meta device page, enter the printed code, and approve the login in your own
   browser. The login completes by itself.
4. Select a `muse-*` model exposed by the `meta` provider, for example `meta/muse-spark-1.3`.
   On opencode 2.x the plugin routes inference through the local adapter, so client tool names that
   collide with Muse Code's builtins no longer trip Meta's client gate. The V1 plugin API still
   sends requests straight to `api.meta.ai` and keeps receiving the 403.

The plugin mints a stable, account-bound inference key and hands it to opencode. The OAuth access
token from the login flow is kept in memory only and is never written to disk.

## Features

- Registers an `auth` hook for the built-in `meta` provider; there is no separate provider id to
  configure.
- Runs the Meta device-code exchange (RFC 8628) inside `/connect`, then mints the subscription
  inference key through the Model API.
- Routes through the Responses API; the `meta.txt` system prompt applies automatically to `muse-*`
  model ids.
- Runs a loopback wire adapter for the V2 plugin API: it aliases the client tool names that collide
  with Muse Code's builtins on the way to `api.meta.ai`, restores them in the response, and
  normalizes parameters Meta rejects (`tool_choice`, reasoning effort, output-token floor,
  encrypted-reasoning include). The adapter's `/v1` origin becomes the per-request base URL; on
  routes that ignore that override the plugin rewrites the assembled request onto the same origin.
  Routing does not depend on the credential type: an existing `meta` API key and the V2 Muse OAuth
  connection both go through the adapter; the OAuth access token only overrides `Authorization`
  when the V2 sign-in is active. If Meta still refuses the request, the adapter retries once with
  every tool aliased. See [ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md).
- V1 storage: the OpenCode auth store is the primary source, and the loader falls back to the
  legacy cache only when the store has no key.
- V2 storage: the credential lives in the OpenCode integration store, and no local cache is
  written on this path.
- Never re-mints on its own; re-run `/connect` only after a 401, because the mint endpoint is
  aggressively rate-limited.
- Flow parameters are compatible with the published behavior of oh-my-pi (MIT); see [NOTICE](NOTICE)
  and [AUTH_CONTRACT.md](AUTH_CONTRACT.md).

## Requirements

- opencode 2.2.4 or newer for inference through the adapter (the V2 plugin module shape; 2.2.0
  loads the plugin but does not invoke its setup). On the V1 plugin API the plugin keeps
  authenticating but still receives Meta's `client_attestation_denied` 403.
- Node.js 22.6 or newer for development; CI runs Node.js 22 and 24.
- An active Muse Code subscription on the Meta account used at login.

## Configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `plugins` entry in `opencode.json` | Loads the plugin. | not set |
| Auth store | Primary credential storage used by the V1 loader. | `~/.local/share/opencode/auth.json` |
| Legacy cache | Read-only fallback for credentials written by earlier versions. | `~/.config/opencode/muse-code-sub.json` |
| `/connect` method | Selects Muse Code subscription login for the `meta` provider. | `meta` provider |
| `MUSE_CODE_ADAPTER` | `off` keeps the local proxy but disables the tool-name reshaping and parameter normalization. | unset |

## Privacy and security

The inference key is held by opencode: in the V1 auth store or the V2 integration store. The
legacy cache, when present, stores only `apiKey`, `accountId`, and `email`; the OAuth access token
is never written to disk. The plugin talks only to `auth.meta.com` for the device login and
`api.meta.ai` for key minting and inference. The V2 wire adapter listens on `127.0.0.1` only,
forwards the `Authorization` header unchanged, and never reads, stores or logs credentials,
request bodies or response bodies. See [SECURITY.md](SECURITY.md) for vulnerability reporting and
[ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md) for the inference wire rules.

To remove access:

- disconnect the provider or log out in opencode (the store is
  `~/.local/share/opencode/auth.json`);
- delete `~/.config/opencode/muse-code-sub.json` if an older version created it;
- run `muse logout` if you also want to clear the Muse Code CLI session;
- remove `opencode-muse-auth` from `opencode.json`.

## Troubleshooting

### `/connect` shows no Muse Code subscription method

The plugin is not loaded. Check the JSON syntax of `opencode.json`, the plugin name spelling, and
the package installation, then restart opencode.

### Requests fail with 401 or access was revoked

A 401 may indicate a rotated or revoked key. Re-run `/connect` once; the plugin never re-mints on
its own.

### Meta rejects subscription requests from this client

Meta may return a 403 mentioning `client_attestation_denied` or that Muse Code subscriptions cover
the Muse Code client only. With the V2 adapter running this should not happen for tool names that
collide with Muse Code's builtins. If it appears anyway, one of these is true:

- the adapter could not bind its loopback port; opencode's log records
  `the local request adapter could not start`, and the provider stays on the direct endpoint;
- `MUSE_CODE_ADAPTER=off` is set, which keeps the proxy but disables the reshaping;
- you are on the V1 plugin API, which has no adapter;
- the plugin is older than 0.5.1 or opencode is older than 2.2.4: 0.5.0 skipped the adapter when
  the active `meta` credential was a plain API key, and opencode 2.2.0 loads the plugin without
  invoking its V2 setup. Check `opencode plugin list` and `opencode --version`, then update;
- Meta changed the gate, for example to a real per-client signature. Nothing in this plugin can
  forge one.

This is a client restriction, not evidence of an expired key. Signing in again does not remove it.
Use Muse Code for the subscription, or a separate pay-as-you-go Meta Model API key for other
clients, subject to Meta's terms.

### The login times out or is denied

Approve the printed code in the browser before the flow expires, then retry. A login rejected by
Meta usually means the account has no active Muse Code subscription.

### A legacy cache file is still present

It is harmless: the V1 loader prefers the OpenCode auth store and reads the cache only when the
store has no key. Delete the file if you are migrating to V2 storage.

## Development

Requirements: Node.js 22.6 or newer and npm.

```bash
git clone https://github.com/TheStreamCode/opencode-muse-auth.git
cd opencode-muse-auth
npm install
npm run build
npm test
```

`npm test` builds with `tsc` and runs the TypeScript test suite with the Node test runner. CI runs
the same gate on Node.js 22 and 24; Node 22 needs 22.6 or newer for test-runner type stripping.
No Meta account is needed for the test suite.

## Support

Usage questions and workflows belong in GitHub Discussions; reproducible defects belong in GitHub
Issues using the bug report form. See [SUPPORT.md](SUPPORT.md). Problems in opencode or Meta
themselves belong to their respective projects.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests must pass the required CI checks.

## License

MIT — see [`LICENSE`](LICENSE). The software is provided "as is"; see
[DISCLAIMER.md](DISCLAIMER.md) for the risk notice and liability terms.

---

Maintained by [Michael Gasperini (Mikesoft)](https://mikesoft.it).
If this project is useful to you, consider
[sponsoring its maintenance](https://github.com/sponsors/TheStreamCode).
