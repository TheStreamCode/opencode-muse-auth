# opencode-muse-auth

Use Meta **Muse Spark** in [opencode](https://opencode.ai) billed to your
**Muse Code monthly subscription** — no pay-as-you-go API key, no third-party CLI.

## Install

```jsonc
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-muse-auth"]
}
```

Then run `/connect` in opencode, pick the `meta` provider and the
*Muse Code subscription* method: it shows a Meta device page URL and a code.
Enter the code in your browser (your own Meta account) and the login
completes by itself.

## Requirements

- opencode with plugin support
- A Meta account with an active Muse Code subscription

## How it works

The plugin registers an `auth` hook for the built-in `meta` provider
(Routes through the Responses API, `meta.txt` system prompt applies
automatically to `muse-*` model ids):

- **Login** — Meta device-code exchange (RFC 8628) inside `/connect`, then
  mints the stable account-bound inference key via the Model API. The key is
  cached locally (`~/.config/opencode/muse-code-sub.json`, owner-only
  permissions where supported) and never printed.
- **Runtime** — an auth `loader` injects the cached key on every startup.
  The mint endpoint is aggressively rate-limited, so the plugin never
  re-mints on its own; re-run `/connect` only if access is revoked (401).

Flow parameters are compatible with the published behavior of oh-my-pi (MIT);
see [NOTICE](NOTICE).

## Development

```sh
npm install
npm run build
npm test
```

## License

MIT — see [LICENSE](LICENSE).
