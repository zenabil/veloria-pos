// Veloria PoS — Paramètres : fréquences sauvegarde (pur, sans IO).
// Extrait verbatim de `SettingsSectionsB.tsx` (P2 : découpage sans changement
// de comportement). ADR-075 : `backupFrequencyMinutes` + `BackupFrequency`
// sont réexportés du domaine `@domain/backup/backup-rules.ts` (source unique,
// borne [5,10080]) ; ici ne restent que les libellés d'affichage FR
// (`BACKUP_FREQUENCIES`) et le repli legacy (`backupFrequencyFromAuto`).

import type { BackupFrequency } from "@domain/backup/backup-rules.ts";
export type { BackupFrequency };
export { backupFrequencyMinutes } from "@domain/backup/backup-rules.ts";

export const BACKUP_FREQUENCIES: { value: BackupFrequency; label: string }[] = [
  { value: "10min", label: "Toutes les 10 minutes" },
  { value: "30min", label: "Toutes les 30 minutes" },
  { value: "1h", label: "Toutes les heures (1 heure)" },
  { value: "6h", label: "Toutes les 6 heures" },
  { value: "12h", label: "Toutes les 12 heures" },
  { value: "daily", label: "Quotidien" },
  { value: "weekly", label: "Hebdomadaire" },
  { value: "custom", label: "Personnalisé" },
];

/** Repli legacy : `auto` ne portait que `intervalDays` (jours). */
export function backupFrequencyFromAuto(auto: {
  frequency?: unknown;
  customMinutes?: unknown;
  intervalDays?: unknown;
}): { frequency: BackupFrequency; customMinutes: number } {
  if (
    typeof auto.frequency === "string" &&
    (BACKUP_FREQUENCIES as { value: string }[]).some((f) => f.value === auto.frequency)
  ) {
    const frequency = auto.frequency as BackupFrequency;
    const custom =
      typeof auto.customMinutes === "number" &&
      Number.isInteger(auto.customMinutes) &&
      auto.customMinutes >= 5 &&
      auto.customMinutes <= 10080
        ? auto.customMinutes
        : 60;
    return { frequency, customMinutes: custom };
  }
  const days =
    typeof auto.intervalDays === "number" && Number.isInteger(auto.intervalDays)
      ? auto.intervalDays
      : 1;
  if (days <= 0) return { frequency: "10min", customMinutes: 60 };
  if (days === 1) return { frequency: "daily", customMinutes: 60 };
  if (days === 7) return { frequency: "weekly", customMinutes: 60 };
  return { frequency: "custom", customMinutes: Math.min(10080, Math.max(5, days * 1440)) };
}
