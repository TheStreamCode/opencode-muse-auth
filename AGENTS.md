# Agent instructions

Repository: opencode-muse-auth
Maintainer: Michael Gasperini (Mikesoft)

This repository is an unofficial opencode plugin that registers Muse Code subscription login. The
unofficial-use framing in `DISCLAIMER.md` and the pinned wire values in `AUTH_CONTRACT.md` are part
of the contract: keep them intact and in sync with the sibling Muse plugins (`dsh-muse-code`,
`hermes-muse-code`, `openclaw-muse-code`).

## Layout

- `index.js` — root entry point for local directory installs.
- `src/auth.ts`, `src/index.ts` — auth hook, device-code flow, credential storage.
- `tests/` — Node test-runner suite for the plugin and auth behavior.
- `AUTH_CONTRACT.md` — pinned device-flow and key-mint contract shared with the sibling plugins.
- `.github/workflows/` — CI and npm publish; do not weaken checks, pins, or permissions.

## Commands

```bash
npm install
npm run build
npm test
```

`npm test` builds first and runs the TypeScript suite with the Node test runner. Use npm and the
committed `package-lock.json`; never regenerate the lockfile without a dependency change.

## Constraints

- Keep changes focused; no drive-by refactors, no new runtime dependencies without a stated
  reason.
- Public documentation, comments, and commit messages are in English.
- Do not change `LICENSE`, `NOTICE`, `DISCLAIMER.md`, `AUTH_CONTRACT.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, or release metadata unless the task is about them.
- Never log, print, commit, or describe a subscription key, OAuth token, or account data. The
  legacy cache stores `apiKey`, `accountId`, and `email` only; the OAuth access token is never
  persisted.
- Never add instructions that bypass Meta's terms or credential rules.
- Releases are tag-driven; publishing runs from the release event through OIDC trusted publishing.
  Do not create tags, releases, or publish packages by hand.
- Run the checks above before proposing a change.
