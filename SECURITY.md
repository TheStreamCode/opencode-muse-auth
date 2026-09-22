# Security Policy

## Supported versions

Security fixes target the latest published release and the current `main` branch.

## Reporting a vulnerability

This plugin mints account-bound credentials. Report security issues privately:
use GitHub's **private vulnerability reporting** (Security Advisories) on this
repository. If that route is unavailable, email `info@mikesoft.it` with the
subject `opencode-muse-auth Security Report`. Do not open a public issue for
sensitive findings.

## Credential handling

The Muse subscription key is cached owner-only at
`~/.config/opencode/muse-code-sub.json`. It is never re-minted while valid,
never printed, and never logged. Never commit keys, tokens, or account data to
this repository, and never paste real credentials into issues, pull requests,
or test fixtures.

On a `401`, delete the cached file and re-run `/connect` to mint a fresh key.
