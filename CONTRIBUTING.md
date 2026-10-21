# Contributing

## Scope

This repository is maintained by Michael Gasperini (Mikesoft). Bug reports and focused proposals are
welcome through GitHub Issues. Support questions belong in the channel described in `SUPPORT.md`.
Security issues must follow `SECURITY.md` and must not be reported publicly.

## Reporting a bug

Open a bug report and include:

- what you expected and what happened;
- the exact version (release tag or package version);
- operating system, runtime version and the product version it integrates with;
- the smallest reproduction you can share, with logs and error text.

Reports without version information cannot be reproduced and may be closed.

## Proposing a change

1. Open an issue describing the problem before writing code, unless the change is a typo or a
   documentation fix.
2. Fork the repository and create a branch from `main`.
3. Keep the change focused: one problem per pull request.
4. Follow Conventional Commits (`type(scope): summary`, English, imperative mood).
5. Update documentation and `CHANGELOG.md` when behavior changes.
6. Run the checks listed in the README development section before opening the pull request.

## What is not accepted

- Changes that add telemetry, analytics or background network calls without an explicit maintainer
  decision.
- Dependency bumps that are not validated by CI.
- Large refactors mixed with behavior changes.
- Reformatting of unrelated files.

## Review and release

Pull requests must pass the required checks. Releases are tag-driven and are published only by the
maintainer. Merge method is squash, and the commit title follows Conventional Commits.
