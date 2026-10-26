// Veloria PoS — Main : normalisation des codes-barres stockés.
// Les douchettes peuvent émettre des minuscules (Verr. Maj inactif) ; la
// recherche est déjà insensible à la casse, mais la fiche doit rester lisible
// et cohérente avec les étiquettes Code 39 (majuscules).

export function normalizeBarcodeText(raw: string): string {
  return raw.trim().replace(/[a-z]/g, (c) => c.toUpperCase());
}
