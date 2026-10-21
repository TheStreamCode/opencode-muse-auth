# opencode-muse-auth

Muse Code subscription sign-in for opencode

[![CI](https://github.com/TheStreamCode/opencode-muse-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/opencode-muse-auth/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/opencode-muse-auth)](https://www.npmjs.com/package/opencode-muse-auth)

opencode plugin that registers the **Muse Code subscription** login method for the built-in `meta`
provider, so Meta Muse Spark is billed to a Muse Code monthly subscription instead of per-token API
credits. No API key to copy and no third-party CLI to install.

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

The plugin mints a stable, account-bound inference key and hands it to opencode. The OAuth access
token from the login flow is kept in memory only and is never written to disk.

## Features

- Registers an `auth` hook for the built-in `meta` provider; there is no separate provider id to
  configure.
- Runs the Meta device-code exchange (RFC 8628) inside `/connect`, then mints the subscription
  inference key through the Model API.
- Routes through the Responses API; the `meta.txt` system prompt applies automatically to `muse-*`
  model ids.
- V1 storage: the OpenCode auth store is the primary source, and the loader falls back to the
  legacy cache only when the store has no key.
- V2 storage: the credential lives in the OpenCode integration store, and no local cache is
  written on this path.
- Never re-mints on its own; re-run `/connect` only after a 401, because the mint endpoint is
  aggressively rate-limited.
- Flow parameters are compatible with the published behavior of oh-my-pi (MIT); see [NOTICE](NOTICE)
  and [AUTH_CONTRACT.md](AUTH_CONTRACT.md).

## Requirements

- opencode with plugin support, including the v2 plugin module shape accepted by opencode 1.18.29+
  and 2.x.
- Node.js 22.6 or newer for development; CI runs Node.js 22 and 24.
- An active Muse Code subscription on the Meta account used at login.

## Configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `plugins` entry in `opencode.json` | Loads the plugin. | not set |
| Auth store | Primary credential storage used by the V1 loader. | `~/.local/share/opencode/auth.json` |
| Legacy cache | Read-only fallback for credentials written by earlier versions. | `~/.config/opencode/muse-code-sub.json` |
| `/connect` method | Selects Muse Code subscription login for the `meta` provider. | `meta` provider |

## Privacy and security

The inference key is held by opencode: in the V1 auth store or the V2 integration store. The
legacy cache, when present, stores only `apiKey`, `accountId`, and `email`; the OAuth access token
is never written to disk. The plugin talks only to `auth.meta.com` for the device login and
`api.meta.ai` for key minting and inference. See [SECURITY.md](SECURITY.md) for vulnerability
reporting.

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

The key was rotated or revoked. Re-run `/connect` once; the plugin never re-mints on its own.

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
