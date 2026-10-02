// Veloria PoS — Tests P2 : formateurs fichiers + fréquences sauvegarde.
import { describe, it, expect } from "vitest";
import { formatBytes } from "@/shared/formatters/files.ts";
import {
  BACKUP_FREQUENCIES,
  backupFrequencyFromAuto,
  backupFrequencyMinutes,
} from "@/features/settings/backup-frequency.ts";

describe("formatBytes (tailles humaines FR)", () => {
  it("octets / Ko / Mo + garde corrompu", () => {
    expect(formatBytes(0)).toBe("0 o");
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(1023)).toBe("1023 o");
    expect(formatBytes(1024)).toBe("1.0 Ko");
    expect(formatBytes(1536)).toBe("1.5 Ko");
    expect(formatBytes(1024 * 1024)).toBe("1.00 Mo");
    expect(formatBytes(NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
  });
});

describe("backup-frequency (repli legacy)", () => {
  it("8 fréquences labellisées", () => {
    expect(BACKUP_FREQUENCIES).toHaveLength(8);
    expect(backupFrequencyMinutes("daily", 60)).toBe(1440);
    expect(backupFrequencyMinutes("10min", 60)).toBe(10);
    expect(backupFrequencyMinutes("custom", 45)).toBe(45);
  });

  it("fromAuto: fréquence valide + custom borné, sinon legacy jours", () => {
    expect(backupFrequencyFromAuto({ frequency: "6h", customMinutes: 60 })).toEqual({
      frequency: "6h",
      customMinutes: 60,
    });
    expect(backupFrequencyFromAuto({ frequency: "custom", customMinutes: 3 })).toEqual({
      frequency: "custom",
      customMinutes: 60,
    });
    expect(backupFrequencyFromAuto({ intervalDays: 1 })).toEqual({
      frequency: "daily",
      customMinutes: 60,
    });
    expect(backupFrequencyFromAuto({ intervalDays: 7 })).toEqual({
      frequency: "weekly",
      customMinutes: 60,
    });
    expect(backupFrequencyFromAuto({})).toEqual({ frequency: "daily", customMinutes: 60 });
    expect(backupFrequencyFromAuto({ intervalDays: 0 })).toEqual({
      frequency: "10min",
      customMinutes: 60,
    });
  });
});
