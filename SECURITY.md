# Security Policy

## Supported versions

Security fixes are shipped for the latest release only.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

Do not open a public issue for a security problem. Report it privately through
[GitHub Security Advisories](../../security/advisories/new) on this repository.

Include:

- affected version and platform;
- a description of the issue and its impact;
- reproduction steps or a proof of concept;
- any mitigation you already know about.

You can expect an initial acknowledgement within 7 days and a status update within 30 days. If the
report is valid, a fix is prepared privately and disclosed in the release notes once a patched
version is available. Credit is given in the advisory unless you ask otherwise.

## Scope

In scope:

- defects in this repository's code, build scripts or release artifacts;
- credential or secret exposure caused by this project;
- privilege or sandbox escapes in code shipped by this project.

Out of scope:

- vulnerabilities in third-party products this project integrates with (report them upstream);
- misconfiguration of a user's environment;
- social engineering, spam or denial-of-service against third-party services.

## Handling of credentials

This project never asks for credentials in issues, pull requests or logs. Do not paste tokens,
cookies or personal access tokens in a report. Redact secrets from logs before attaching them.
