---
name: veloria-license
description: "Design, implement, and test Veloria's offline activation and license enforcement, including signed license files, public-key verification, device binding, feature capabilities, key rotation, and recovery/support flows."
---

# Veloria License — offline activation and capability enforcement

## Mission

Provide reliable offline license verification and capability control without embedding vendor signing secrets in the customer POS. Make legitimate activation, renewal, device replacement, and recovery supportable.

## Inspect before changing

Verify current license format, schema version, signing algorithm, public-key resources, private-key custody, activation manager, fingerprint inputs, protected state, capability catalog, compatibility rules, package manifest, and main-process enforcement. Treat exact algorithms, capability counts, page names, and paths in old source notes as historical until confirmed.

## Cryptographic design

- Use an established asymmetric signature algorithm and a well-maintained cryptographic implementation. The customer application contains only verification public keys; signing private keys remain in a controlled vendor environment.
- Sign a canonical, versioned payload. Define canonicalization precisely and reject duplicate/ambiguous fields.
- Pin the allowed algorithm. Reject algorithm negotiation, unsigned payloads, unknown critical fields, malformed encodings, and unsupported schema versions.
- Support public-key rotation with an overlap period and explicit key identifiers. Never replace the only verification key in a way that invalidates legitimately issued licenses without a migration plan.
- Keep signing operations auditable and restrict access to private signing material. Never commit private keys or test signing secrets.

## License payload and validation

Define the minimum claims required: product identity, license identifier, issue/start/expiry timestamps, edition/plan, enabled capabilities, device binding policy, schema version, and signed status when applicable. Do not collect unnecessary customer personal data.

Validation order must be deterministic and tested. At minimum validate structure, product, signature, device binding, dates, clock policy, revocation/suspension claims if supported, and integrity manifest if used. Return stable internal reason codes and safe French user messages.

## Offline and device-binding limits

- Hardware fingerprints are probabilistic identifiers, not immutable identities. Use multiple stable signals where appropriate, tolerate benign hardware replacement according to a documented threshold, and provide a support/reset process.
- Minimize collected device attributes and document privacy impact.
- Clock rollback detection is a deterrent, not proof against a privileged local attacker. Avoid bricking legitimate users after a benign clock correction; define support recovery.
- Do not promise tamper-proof or unbreakable protection. State realistic threat limits.

## Enforcement

- Verify and enforce license state in trusted main/application services, never only in renderer visibility.
- Protect both screen navigation and underlying privileged operations where required.
- Fail closed for invalid or unverifiable authorization, but preserve customer data and provide a safe activation/recovery path.
- Capability catalogs must have one authoritative source or parity tests if mirrored.
- Feature removal must not silently break previously issued valid licenses; maintain explicit compatibility rules.

## Testing

Valid signature, tampered field, wrong product, wrong key, unsupported algorithm/version, expiry boundary, start date, device drift, clock rollback, missing key, key rotation, corrupted state, capability denial, main-process bypass attempt, and recovery/reset path.

## Reference

- `references/license-format-and-operations.md`
