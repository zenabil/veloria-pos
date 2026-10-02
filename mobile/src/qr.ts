// Veloria Client (APK) — Parseur QR d'activation (pur, testé).
// MIROIR du format POS (ADR-054) : `VELORIA1|<phone>|<pin>|<code>`.
// Le PIN reste le seul secret de connexion (même appel `client-sync`) ;
// le code d'activation n'est pas utilisé côté APK (traçage futur).
// Toute évolution du format : POS use-case + repo + ici + tests des deux côtés.

export const ACTIVATION_QR_PREFIX = "VELORIA1";

export interface QrCredentials {
  phone: string;
  pin: string;
}

export class QrError extends Error {
  constructor() {
    super("QR_INVALIDE");
    this.name = "QrError";
  }
}

/** Extrait {phone, pin} d'un QR scanné, sinon QrError (mappée ar/fr à l'écran). */
export function parseActivationQr(text: string): QrCredentials {
  const parts = text.trim().split("|");
  if (parts.length !== 4 || parts[0] !== ACTIVATION_QR_PREFIX) throw new QrError();
  const phone = (parts[1] ?? "").trim();
  const pin = parts[2] ?? "";
  const code = parts[3] ?? "";
  if (phone.length < 1 || phone.length > 30) throw new QrError();
  if (!/^[0-9]{6}$/.test(pin)) throw new QrError();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(code)) throw new QrError();
  return { phone, pin };
}
