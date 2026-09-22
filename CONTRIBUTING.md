# Contributing to opencode-muse-auth

Thanks for your interest in improving this project! Bug reports, fixes, docs,
and tests are all welcome.

## Development setup

```bash
npm ci
npm run build
npm test
```

CI repeats the same gate on Node 20, 22, and 24.

## Pull requests

- Keep changes focused; one concern per PR.
- Add or update tests for behavior changes.
- Never commit API keys, tokens, subscription keys, or account data.
- Never print or log the cached subscription key in code or fixtures.
