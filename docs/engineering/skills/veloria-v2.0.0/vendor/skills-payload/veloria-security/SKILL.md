---
name: veloria-security
description: "Perform secure-by-design reviews and threat modeling across Veloria POS, license manager, customer app, sync bridge, updates, local data, IPC, dependencies, and release artifacts."
---

# Veloria Security — threat modeling and secure implementation

## Mission

Reduce realistic attack paths while preserving the offline-first product experience and legitimate customer workflows. Security claims must be proportional to evidence; no system should be described as unbreakable.

## Threat-model scope

At the start of a security-sensitive task, define assets, trust boundaries, actors, entry points, privileges, data sensitivity, deployment assumptions, and attacker capabilities. Include local machine users, untrusted imported files, compromised dependencies, malicious renderer content, physical access, and cloud/customer-app boundaries where relevant.

## Minimum review areas

- Electron renderer/main/preload boundary and IPC authorization.
- SQLite integrity, filesystem paths, backups, and import/export.
- License signing/verification and key custody.
- Updates, installer signing, artifact integrity, and dependency chain.
- Secrets in source, config, environment, database, logs, renderer, mobile bundle, and build artifacts.
- Customer authentication and per-customer data isolation in any bridge.
- Input validation, SQL parameterization, injection, path traversal, unsafe deserialization, and untrusted file parsing.
- Data minimization, retention, local protection, and sanitized support bundles.

## Implementation principles

- Apply least privilege and narrow interfaces.
- Validate at every trust boundary; client-side validation is not authorization.
- Keep secrets server-side or in protected OS storage as appropriate. Never embed vendor private signing keys in customer software.
- Use maintained cryptographic libraries and standard algorithms; do not design custom crypto.
- Fail closed for authorization/verification failure without destroying customer data.
- Avoid leaking personal or financial data in logs, crash reports, URLs, or QR payloads.
- Make security-critical actions auditable.
- Treat offline limitations honestly: disconnected systems cannot receive instantaneous remote revocation or threat intelligence.

## Review workflow

1. Create a lightweight threat model.
2. Trace inputs and privileges end-to-end.
3. Identify abuse cases and controls.
4. Add negative tests that prove rejection.
5. Inspect dependencies and package artifacts when applicable.
6. Record residual risks and user-facing operational controls.

## Findings

For every finding include: ID, affected component, severity/rationale, preconditions, impact, evidence, remediation, regression test, and residual risk. Do not publish exploit steps for unrelated third-party systems; keep testing within authorized project assets.

## Reference

- `references/threat-model-checklist.md`
