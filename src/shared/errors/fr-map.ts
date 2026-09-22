// Veloria PoS — Shared: message d'erreur FR sûr pour l'UI + log technique.
// Règle P1-7 : un message métier (domaine FR ou main via `toUserMessage`) passe
// tel quel ; un message technique brut (TypeError JS, SQLITE, chemins, stack,
// Zod, "Invalid Date", NaN) est JOURNALISÉ (console technique) et remplacé par
// le repli FR contextuel. Ne JAMAIS afficher `err.message` brut à l'utilisateur.
const TECHNICAL_RE =
  /Cannot read|is not a function|is not defined|of undefined|undefined is not|null is not an object|Invalid Date|SQLITE_|UNIQUE constraint|no such (table|column|file|directory)|syntax error|RAISE|ABORT|ENOENT|EACCES|EPERM|ENOSPC|EEXIST|ECONNRESET|TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError|node_modules|\.tsx?:\d+|\.js:\d+|^\s*\[|\binvalid_type\b|\bNaN\b/i;

/** true si le message est technique brut (jamais affichable tel quel). */
export function isTechnicalMessage(msg: string): boolean {
  return TECHNICAL_RE.test(msg);
}

/**
 * Message FR affichable : message métier tel quel, technique → repli + log.
 * `fallback` = message FR contextuel de l'appelant (jamais générique vide).
 */
export function frError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (!isTechnicalMessage(err.message)) return err.message;
    try {
      console.error("[Veloria]", err);
    } catch {
      /* journal best effort */
    }
    return fallback;
  }
  if (typeof err === "string") {
    return isTechnicalMessage(err) ? fallback : err;
  }
  return fallback;
}
