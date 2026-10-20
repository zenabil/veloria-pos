// Veloria PoS - IPC: erreurs FR + reponses ok (extrait de registry.ts, deplacement pur).
// Source unique des messages utilisateur FR cote main.

import os from "node:os";

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function toUserMessage(err: unknown): { code: string; message: string } {
  // Zod : message technique anglais -> message FR générique (détail en log).
  if (err instanceof Error && err.name === "ZodError") {
    return { code: "VALIDATION_ERROR", message: "Données invalides. Vérifiez le formulaire." };
  }
  // P1-7 : erreurs métier du domaine (miroir des codes
  // src/domain/common/errors.ts) �?" message FR transmis tel quel AVEC son code.
  const DOMAIN_CODES: ReadonlySet<string> = new Set([
    "VALIDATION_ERROR",
    "MONEY_ERROR",
    "QUANTITY_ERROR",
    "BARCODE_ERROR",
    "PRODUCT_ERROR",
    "CUSTOMER_ERROR",
    "SALE_ERROR",
    "STOCK_ERROR",
    "RETURN_ERROR",
    "PAYMENT_ERROR",
    "PROFORMA_ERROR",
    "BREAD_ERROR",
    "SUPPLIER_ERROR",
    "CLOSING_ERROR",
    "IMPORT_ERROR",
    "ZAKAT_ERROR",
    "CONFLICTING_OPERATION",
  ]);
  const msg = err instanceof Error ? err.message : "Erreur inconnue.";
  const errCode = err instanceof Error ? (err as unknown as { code?: unknown }).code : undefined;
  if (typeof errCode === "string" && DOMAIN_CODES.has(errCode)) {
    return { code: errCode, message: msg };
  }
  // SQLite constraint messages -> French
  if (/UNIQUE constraint failed: product_barcodes.barcode/i.test(msg)) {
    return { code: "VALIDATION_ERROR", message: "Ce code-barres existe déjà." };
  }
  if (
    /UNIQUE constraint failed: (sales\.invoice_number|proforma_invoices\.proforma_number|bread_orders\.order_number)/i.test(
      msg,
    )
  ) {
    return {
      code: "CONFLICTING_OPERATION",
      message: "Numéro déjà utilisé. Veuillez réessayer.",
    };
  }
  if (/UNIQUE constraint failed: categories\.name/i.test(msg)) {
    return { code: "VALIDATION_ERROR", message: "Cette catégorie existe déjà." };
  }
  if (/UNIQUE constraint failed: suppliers\.code/i.test(msg)) {
    return { code: "VALIDATION_ERROR", message: "Ce code fournisseur existe déjà." };
  }
  if (/DATABASE_UNAVAILABLE/i.test(msg)) {
    return {
      code: "DATABASE_UNAVAILABLE",
      message: "Base de données indisponible. Redémarrez l'application.",
    };
  }
  if (/corrompue ou incohérente|plus récente de Veloria PoS/i.test(msg)) {
    return {
      code: msg.includes("corrompue") ? "DATABASE_CORRUPTED" : "CONFLICTING_OPERATION",
      message: msg,
    };
  }
  // E-21 / E-28 (P1) : messages des triggers de la base (RAISE ABORT).
  // SQLite renvoie ces messages avec un `code` technique (SQLITE_CONSTRAINT_*)
  // : sans ce mapping, l'opérateur verrait « Une erreur inattendue est
  // survenue » au lieu de la cause réelle. Les messages des triggers sont
  // déjà rédigés en français ⇒ on les transmet tels quels.
  if (/Journée déjà clôturée/i.test(msg)) {
    return {
      code: "CLOSING_ERROR",
      message: "Journée déjà clôturée : réouverture requise pour la corriger.",
    };
  }
  if (/numéro de téléphone est déjà utilisé/i.test(msg)) {
    return {
      code: "VALIDATION_ERROR",
      message: "Ce numéro de téléphone est déjà utilisé par un autre client.",
    };
  }
  // Erreurs SQLite internes (jamais exposées telles quelles).
  if (/SQLITE_|constraint failed|no such (table|column)|syntax error|RAISE|ABORT/i.test(msg)) {
    return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
  }
  // Erreurs système Node (jamais de chemin/technique brut à l'utilisateur).
  if (/ENOENT|EACCES|EPERM|ENOSPC|EEXIST/i.test(msg)) {
    return {
      code: "UNKNOWN_ERROR",
      message: "Opération fichier impossible. Vérifiez les droits et l'espace disque.",
    };
  }
  // Licence hors-ligne : messages FR du LicenseService �?' code dédié
  // (l'UI distingue l'activation requise des erreurs de formulaire).
  if (
    /licence|activation|réactiv|fonction protégée|n'est pas incluse|non disponible dans votre licence|révoquée|suspendue/i.test(
      msg,
    )
  ) {
    const code = /n'est pas incluse/i.test(msg)
      ? "FEATURE_NOT_LICENSED"
      : /non disponible dans votre licence/i.test(msg)
        ? "PAGE_NOT_LICENSED"
        : "LICENSE_REQUIRED";
    return { code, message: msg };
  }
  // P1-7 : exceptions JS brutes (bugs : TypeError, chemins, stack) �?" jamais
  // de technique brut à l'utilisateur, repli FR générique + détail en log.
  if (
    err instanceof TypeError ||
    /Cannot read|is not a function|is not defined|of undefined|undefined is not|Invalid Date|at\s+\S+\s*\(|\.tsx?:\d+|\.js:\d+|node_modules|\bNaN\b/i.test(
      msg,
    )
  ) {
    return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
  }
  // M2 : garde de langue �?" tout message technique anglais (erreurs Node/
  // Electron : « Attempted to register a second handler », « fetch failed »�?�)
  // ne doit JAMAIS atteindre l'opérateur (AGENTS §6). Les vrais messages
  // métier sont rédigés en français (accents/vocabulaire) et passent ci-dessous.
  if (
    /\b(attempted to register|handler|ECONNREFUSED|ENOEXEC|fetch failed|unexpected|expected|exception|internal error|unknown error|failed to|cannot |unable to|undefined is not|is not a function|not authorized|forbidden|unauthorized)\b/i.test(
      msg,
    )
  ) {
    return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
  }
  // A-04 (P1) : une erreur MOTEUR non reconnue ne doit JAMAIS atteindre
  // l'opérateur en clair (AGENTS §6). Deux signaux fiables :
  //  (a) le `code` d'erreur système (SQLITE_*, ERR_*, ECONN*, ENOENT…) ;
  //  (b) un message technique anglais de moteur qui n'était pas listé
  //      (« database is locked », « not a database », « disk I/O error »…).
  // Les messages MÉTIER (rédigés en français par le code) restent transmis
  // tels quels : ils passent tous les filtres ci-dessus.
  if (
    typeof errCode === "string" &&
    /^(SQLITE_|ERR_|E[A-Z]{2,}|MODULE_NOT_FOUND|ECONN|ETIMEDOUT|EPIPE)/.test(errCode)
  ) {
    return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
  }
  if (
    /\b(database is locked|not a database|disk I\/O error|readonly database|out of memory|segmentation fault|terminating|connection (refused|reset|closed)|socket hang up|timed? ?out|broken pipe|too many open files|protocol error|bad (file )?descriptor|cannot allocate|address already in use|invalid argument)\b/i.test(
      msg,
    )
  ) {
    return { code: "UNKNOWN_ERROR", message: "Une erreur inattendue est survenue. Réessayez." };
  }
  // Tous les messages métier du code sont déjà rédigés en français :
  // on les transmet tels quels (pas d'exception brute exposée).
  return { code: "VALIDATION_ERROR", message: msg };
}

/**
 * Libellé système convivial pour l'écran �? propos (au lieu du brut
 * `win32 10.0.26200`) : nom commercial + architecture. Le détail brut reste
 * disponible dans `osDetail` pour le support. Jamais d'exception vers l'UI.
 */
export function friendlyOsLabel(): string {
  const arch = os.arch();
  try {
    if (os.platform() === "win32") {
      // �?dition précise quand disponible (ex. « Windows 11 Pro »), sinon
      // correspondance du noyau : build �?� 22000 = Windows 11.
      const detailed =
        typeof (os as { version?: unknown }).version === "function"
          ? String((os as unknown as { version(): string }).version())
          : "";
      if (/windows\s+\d/i.test(detailed)) return `${detailed.trim()} (${arch})`;
      const release = os.release();
      const build = Number((release.split(".")[2] ?? "0").split("-")[0]);
      if (release.startsWith("10.0.") && build >= 22000) return `Windows 11 (${arch})`;
      if (release.startsWith("10.0.")) return `Windows 10 (${arch})`;
      if (release.startsWith("6.3")) return `Windows 8.1 (${arch})`;
      if (release.startsWith("6.2")) return `Windows 8 (${arch})`;
      if (release.startsWith("6.1")) return `Windows 7 (${arch})`;
      return `Windows (${arch})`;
    }
    if (os.platform() === "darwin") return `macOS ${os.release()} (${arch})`;
    if (os.platform() === "linux") return `Linux ${os.release()} (${arch})`;
    return `${os.platform()} ${os.release()} (${arch})`;
  } catch {
    return `${os.platform()} ${os.release()} (${arch})`;
  }
}
