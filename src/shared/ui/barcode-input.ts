// Veloria PoS — Normalisation de saisie code-barres (UI).
// Les douchettes HID émettent des minuscules quand Verr. Maj est inactif :
// on convertit les lettres ASCII en majuscules sans toucher aux accents, pour
// ne jamais casser la recherche de noms français.

/** Convertit uniquement les lettres ASCII a-z en majuscules. */
export function uppercaseBarcodeInput(raw: string): string {
  return raw.replace(/[a-z]/g, (c) => c.toUpperCase());
}

/** Valeur stockée/envoyée : mêmes règles + espaces de bord retirés. */
export function normalizeBarcodeValue(raw: string): string {
  return uppercaseBarcodeInput(raw).trim();
}
