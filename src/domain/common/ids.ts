// Veloria PoS — Domain: barcode + identifiers.
// UUIDv7 (sortable) generated without external dependency.

import { DomainError } from "./errors.ts";

export function normalizeBarcode(raw: string): string {
  const v = raw.trim();
  if (v.length === 0) throw new DomainError("BARCODE_ERROR", "Code-barres vide.");
  if (v.length > 64) throw new DomainError("BARCODE_ERROR", "Code-barres trop long.");
  if (!/^[0-9A-Za-z\-_.]+$/.test(v)) {
    throw new DomainError("BARCODE_ERROR", "Code-barres invalide.");
  }
  return v;
}

/** Minimal UUIDv7 generator (RFC 9562) using crypto.getRandomValues. */
export function newUuidV7(nowMs: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const unixMs = Math.floor(nowMs);
  const view = new DataView(bytes.buffer);
  // 48-bit big-endian timestamp + version/variant bits (RFC 9562 §5.7)
  view.setUint8(0, Math.floor(unixMs / 2 ** 40) & 0xff);
  view.setUint8(1, Math.floor(unixMs / 2 ** 32) & 0xff);
  view.setUint8(2, Math.floor(unixMs / 2 ** 24) & 0xff);
  view.setUint8(3, Math.floor(unixMs / 2 ** 16) & 0xff);
  view.setUint8(4, Math.floor(unixMs / 2 ** 8) & 0xff);
  view.setUint8(5, unixMs & 0xff);
  // version 7 + random
  view.setUint8(6, 0x70 | (view.getUint8(6) & 0x0f));
  view.setUint8(8, 0x80 | (view.getUint8(8) & 0x3f));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Idempotency / operation id: client-generated once per command retry cycle. */
export function newOperationId(): string {
  return newUuidV7();
}

export function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new DomainError("VALIDATION_ERROR", "Identifiant invalide.");
  }
}
