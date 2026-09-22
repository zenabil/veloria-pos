// Veloria PoS — Feature Licence : libellés FR des états (aucun secret).

export type LicenseStateId =
  | "UNACTIVATED"
  | "ACTIVE"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "REVOKED"
  | "SUSPENDED"
  | "INVALID_SIGNATURE"
  | "INVALID_HARDWARE"
  | "INVALID_PRODUCT"
  | "TAMPER_DETECTED"
  | "CLOCK_ROLLBACK"
  | "CORRUPTED_STATE";

export const LICENSE_STATE_LABELS: Record<LicenseStateId, string> = {
  UNACTIVATED: "Activation requise",
  ACTIVE: "Active",
  EXPIRING_SOON: "Expire bientôt",
  EXPIRED: "Expirée",
  REVOKED: "Révoquée",
  SUSPENDED: "Suspendue",
  INVALID_SIGNATURE: "Licence invalide",
  INVALID_HARDWARE: "Autre ordinateur",
  INVALID_PRODUCT: "Produit incorrect",
  TAMPER_DETECTED: "Intégrité compromise",
  CLOCK_ROLLBACK: "Horloge incohérente",
  CORRUPTED_STATE: "État illisible",
};

export const LICENSE_STATE_TONES: Record<LicenseStateId, "green" | "amber" | "red" | "grey"> = {
  UNACTIVATED: "grey",
  ACTIVE: "green",
  EXPIRING_SOON: "amber",
  EXPIRED: "red",
  REVOKED: "red",
  SUSPENDED: "red",
  INVALID_SIGNATURE: "red",
  INVALID_HARDWARE: "red",
  INVALID_PRODUCT: "red",
  TAMPER_DETECTED: "red",
  CLOCK_ROLLBACK: "red",
  CORRUPTED_STATE: "red",
};

/** États qui bloquent la coquille (fenêtre d'activation dédiée). */
export const LICENSE_BLOCKING_STATES: LicenseStateId[] = [
  "UNACTIVATED",
  "REVOKED",
  "SUSPENDED",
  "INVALID_SIGNATURE",
  "INVALID_HARDWARE",
  "INVALID_PRODUCT",
  "TAMPER_DETECTED",
  "CLOCK_ROLLBACK",
  "CORRUPTED_STATE",
];

export function licenseStateLabel(state: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- compatibilité avant : état futur inconnu → chaîne brute affichée, jamais de vide.
  return LICENSE_STATE_LABELS[state as LicenseStateId] ?? state;
}

export function licenseGuidance(state: string): string {
  switch (state) {
    case "ACTIVE":
      return "Votre licence est valide. Aucune action requise.";
    case "EXPIRING_SOON":
      return "Votre licence expire bientôt : demandez un renouvellement pour éviter toute interruption.";
    case "EXPIRED":
      return "Licence expirée : consultation seule. Importez une licence renouvelée pour réactiver les ventes et le stock.";
    case "REVOKED":
      return "Licence révoquée : contactez votre fournisseur pour régulariser la situation.";
    case "SUSPENDED":
      return "Licence suspendue : contactez votre fournisseur pour la réactiver.";
    case "INVALID_HARDWARE":
      return "Cette licence est associée à un autre ordinateur. Importez la licence émise pour ce poste.";
    case "CLOCK_ROLLBACK":
      return "La date système semble incohérente : corrigez la date et l'heure, puis importez à nouveau votre licence.";
    case "TAMPER_DETECTED":
      return "L'intégrité de l'application semble compromise : réinstallez Veloria POS depuis le programme d'installation officiel, puis réactivez.";
    case "CORRUPTED_STATE":
      return "L'état d'activation est illisible : importez à nouveau votre fichier de licence.";
    case "INVALID_PRODUCT":
      return "Cette licence est destinée à un autre produit.";
    default:
      return "Importez votre fichier de licence (.vlic) pour activer Veloria POS sur cet ordinateur.";
  }
}
