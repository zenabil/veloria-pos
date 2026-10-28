// Veloria PoS — Domain: planification sauvegarde (framework-free, centimes N/A).
// Table des 8 fréquences exigées + rétention. Testée en pur, consommée par
// `electron/backup/backup.service.ts` (jamais d'import src/ côté main dupliqué :
// parité volontaire, voir `main-domain-parity.test.ts`).

export type BackupFrequency =
  "10min" | "30min" | "1h" | "6h" | "12h" | "daily" | "weekly" | "custom";

export const BACKUP_FREQUENCY_MINUTES: Record<Exclude<BackupFrequency, "custom">, number> = {
  "10min": 10,
  "30min": 30,
  "1h": 60,
  "6h": 360,
  "12h": 720,
  daily: 1440,
  weekly: 10080,
};

export function backupFrequencyMinutes(frequency: BackupFrequency, customMinutes: number): number {
  if (frequency === "custom") {
    const n = Math.floor(customMinutes);
    if (!Number.isFinite(n)) return 60;
    return Math.min(10080, Math.max(5, n));
  }
  return BACKUP_FREQUENCY_MINUTES[frequency];
}
