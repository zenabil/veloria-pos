// Veloria PoS — Paramètres : fréquences sauvegarde (pur, sans IO).
// Extrait verbatim de `SettingsSectionsB.tsx` (P2 : découpage sans changement
// de comportement). NOTE : `backupFrequencyMinutes` renderer CLAMP UNIQUEMENT
// via `custom` validé en amont (diffère de `backupFrequencyMinutes` du domaine
// `@domain/backup/backup-rules.ts` qui borne [5,10080] — parité main/domaine
// couverte par `main-domain-parity.test.ts`, ici logique d'affichage seule).

export type BackupFrequency =
  | "10min"
  | "30min"
  | "1h"
  | "6h"
  | "12h"
  | "daily"
  | "weekly"
  | "custom";

export const BACKUP_FREQUENCIES: { value: BackupFrequency; label: string; minutes: number }[] = [
  { value: "10min", label: "Toutes les 10 minutes", minutes: 10 },
  { value: "30min", label: "Toutes les 30 minutes", minutes: 30 },
  { value: "1h", label: "Toutes les heures (1 heure)", minutes: 60 },
  { value: "6h", label: "Toutes les 6 heures", minutes: 360 },
  { value: "12h", label: "Toutes les 12 heures", minutes: 720 },
  { value: "daily", label: "Quotidien", minutes: 1440 },
  { value: "weekly", label: "Hebdomadaire", minutes: 10080 },
  { value: "custom", label: "Personnalisé", minutes: 0 },
];

export function backupFrequencyMinutes(frequency: BackupFrequency, customMinutes: number): number {
  if (frequency === "custom") return customMinutes;
  return BACKUP_FREQUENCIES.find((f) => f.value === frequency)?.minutes ?? 1440;
}

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
