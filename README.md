# opencode-muse-auth

Use Meta **Muse Spark** in [opencode](https://opencode.ai) billed to your
**Muse Code monthly subscription** — no pay-as-you-go API key, no third-party CLI.

> **Unofficial and experimental.** This plugin uses a Muse Code subscription
> credential from opencode. Meta's terms limit that credential to Muse Code, so
> this use may not be supported and Meta may suspend or revoke accounts or
> credentials. Use it at your own risk; the authors cannot recover an account.
> Read [DISCLAIMER.md](DISCLAIMER.md) before installing.

## Install

```jsonc
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-muse-auth"]
}
```

Then run `/connect` in opencode, pick the `meta` provider and the
*Muse Code subscription* method: it shows a Meta device page URL and a code.
Enter the code in your browser (your own Meta account) and the login
completes by itself.

Verified end-to-end against the published package: isolated project with
only `"plugins": ["opencode-muse-auth"]`, live chat on `meta/muse-spark-1.3`
billed to subscription.

## Requirements

- opencode with plugin support
- A Meta account with an active Muse Code subscription

## How it works

The plugin registers an `auth` hook for the built-in `meta` provider
(Routes through the Responses API, `meta.txt` system prompt applies
automatically to `muse-*` model ids):

- **Login** — Meta device-code exchange (RFC 8628) inside `/connect`, then
  mints the stable account-bound inference key via the Model API. The key is
  never printed and the OAuth access token from the login flow is kept in
  memory only.
- **V1 storage** — OpenCode's auth store is the primary source; the auth
  `loader` falls back to the legacy cache
  (`~/.config/opencode/muse-code-sub.json`) only when the store has no key.
  The cache is still written so upgrades keep working.
- **V2 storage** — the credential lives in OpenCode's integration store; the
  plugin does not write the local cache on this path.
- **Runtime** — the mint endpoint is aggressively rate-limited, so the plugin
  never re-mints on its own; re-run `/connect` only if access is revoked (401).

Flow parameters are compatible with the published behavior of oh-my-pi (MIT);
see [NOTICE](NOTICE) and [AUTH_CONTRACT.md](AUTH_CONTRACT.md).

## Credentials and removal

The inference key is held by OpenCode (V1 auth store or V2 integration store);
the legacy cache, when present, stores only `apiKey`, `accountId`, and `email`.
The OAuth access token is never written to disk. To remove access:

- disconnect the provider or log out in OpenCode (this removes the key OpenCode
  uses; the store is `~/.local/share/opencode/auth.json`);
- delete `~/.config/opencode/muse-code-sub.json` if it exists from an older
  version;
- run `muse logout` if you also want to clear the Muse Code CLI session;
- remove `opencode-muse-auth` from `opencode.json`.

## Development

```sh
npm install
npm run build
npm test
```

## License

MIT — see [LICENSE](LICENSE). The software is provided "as is"; see
[DISCLAIMER.md](DISCLAIMER.md) for the risk notice and liability terms.
