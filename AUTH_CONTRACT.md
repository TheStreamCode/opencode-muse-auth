# Muse auth contract (v1)

The three Muse Code plugins implement the same Meta device-code flow. Change
this file and the pinned constants/tests together in all three repositories:

- `opencode-muse-auth`
- `hermes-muse-code`
- `openclaw-muse-code`

## Wire contract

| Item | Value |
|---|---|
| `CLIENT_ID` | `1031625952748946` |
| Device authorization | `https://auth.meta.com/oidc/device/authorization/` |
| Device token | `https://auth.meta.com/oidc/device/token/` |
| Key mint | `https://api.meta.ai/muse-code/key` |
| API version header | `x-api-version: 1.0.0` |
| Cache fields | `apiKey`, `accountId`, `email` (never the OAuth access token) |
| Inference base URL | `https://api.meta.ai/v1` |

## Behaviour

- Device flow: request a device code, poll the token endpoint, accept
  `authorization_pending`, increase the interval on `slow_down`, stop on a
  terminal error or at `expires_in`.
- Key mint: exchange the OAuth access token for the account-bound inference
  key; reject an inactive subscription or a pending payment.
- Persistence: only the inference key and account identity are stored; the
  OAuth access token stays in memory.
- Any change to this contract bumps `AUTH_CONTRACT_VERSION` in the code and
  requires updating the pinned tests in all three repositories.
