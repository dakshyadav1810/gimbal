# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Email the maintainers at the address listed on the package page on npm, or use GitHub's private vulnerability reporting for this repository. Include what you found, how to reproduce it and the version. We aim to reply within a few days.

## What to know about Gimbal's design

- The server binds to `127.0.0.1` only, rejects requests whose `Host` header is not local, and rejects state-changing requests with a foreign `Origin`. It has no authentication, so do not expose its port.
- Stored artifacts (`candidates.json`, page snapshots, repairs) are filtered so they do not contain input values or URL query strings.
- Gimbal calls no model service at run time and sends no data off the machine. The embedding model is downloaded once from Hugging Face and runs locally.
- Secrets used by a test belong in `vars` supplied at run time, not in the spec.
