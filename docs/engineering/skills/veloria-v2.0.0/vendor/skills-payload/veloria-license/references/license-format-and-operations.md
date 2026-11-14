# License format and operations

## Suggested envelope

A license file should have a versioned envelope containing a canonical payload, signature, algorithm identifier (or fixed algorithm by version), and key identifier. The exact wire format must be selected and documented before shipping. Reject ambiguous JSON encodings and duplicate keys.

## Issuance lifecycle

1. Validate the customer/order and intended plan in the vendor manager.
2. Generate a unique license ID and bounded claims.
3. Sign using a controlled private-key service/workstation.
4. Verify the produced artifact using the same public verification path shipped in the POS.
5. Record issuance metadata without storing private signing material in the POS.
6. Deliver through a supportable, integrity-checked channel.

## Customer lifecycle

- Import file/code.
- Validate cryptographic and product claims.
- Evaluate device binding and dates.
- Persist state using platform-appropriate protected storage plus an auditable local anchor when required.
- Enforce features in trusted code.
- Support renewal, migration, device replacement, suspension/revocation policy, and data-preserving recovery.

## Key rotation

- Maintain a key inventory with key IDs, activation dates, retirement dates, and compromise status.
- Ship new verification public keys before issuing licenses signed with them.
- Retain old public keys for the supported validity period.
- If a key is compromised, document containment and customer re-issuance steps.

## Explicit limitations

An offline client cannot receive instantaneous revocation information while disconnected. Hardware fingerprints and local clock state can be spoofed by sufficiently privileged attackers. Design for deterrence, data integrity, and legitimate support—not an impossible guarantee of perfect control.
