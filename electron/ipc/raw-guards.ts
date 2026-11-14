// Veloria PoS — IPC: garde centrale pour les handlers BRUTS (backup/printing/ocr).
// Cause racine H1 : ces handlers utilisent ipcMain.handle direct (retours
// métier spécifiques) et contournaient handle() → enforceStaffGates jamais
// appelée. Correctif radical : UN point de passage obligé qui applique les
// mêmes décisions que handle() (staff-gates ; la licence reste vérifiée par
// guardBackup/guardPrint existants, spécifiques au domaine).
// Usage : au début de chaque handler brut, après le parse Zod :
//   const staffDenied = enforceRawChannelGates(CHANNEL, input);
//   if (staffDenied) return staffDenied;
// Jamais d'exception brute vers le renderer : outcome FR.

import { IPC_CHANNELS } from "./channels";
import { enforceStaffGates } from "./staff-gates";
import { checkSender } from "./sender-guard";
import { getCurrentStaffUser } from "./handlers/staff-session";
import { mustChangeCode } from "./handlers/staff.repo";

type RawDenied = { ok: false; code: string; message: string };

/**
 * A-09 (P1) : le verrou « changement de code obligatoire » (0041
 * `must_change_code`) n'était appliqué que dans `handle()` — les 32 canaux
 * bruts (backup restore, 25 impressions, 4 OCR) le contournaient. Le
 * verrou est ici appliqué sur le MÊME modèle (allowlist des canaux de sortie
 * de session), pour que la contrainte annoncée — « verrou main, pas seulement
 * visuel » (handle.ts) — soit réelle.
 */
const MUST_CHANGE_ALLOWLIST: ReadonlySet<string> = new Set([
  IPC_CHANNELS["staff.changeCode"],
  IPC_CHANNELS["staff.session"],
  IPC_CHANNELS["staff.logout"],
]);

export function enforceRawChannelGates(
  channel: string,
  input: unknown,
  event?: { sender: Electron.WebContents | null },
): RawDenied | null {
  try {
    // SEC-01 / ELEC-04 : PROVENANCE, avant toute porte de rôle. Les canaux
    // bruts ne passent pas par `handle()` : sans cette vérification, un
    // renderer compromis pouvait appeler les 38 canaux d'impression, de
    // sauvegarde et d'OCR sans jamais passer par le point de contrôle
    // central. La requête est refusée AVANT tout effet de bord.
    if (event) {
      const denied = checkSender(event);
      if (denied) return denied;
    }
    enforceStaffGates(channel, input);
    // Verrou de changement de code (même règle que handle.ts:100-102).
    const session = getCurrentStaffUser();
    if (session != null && !MUST_CHANGE_ALLOWLIST.has(channel) && mustChangeCode(session)) {
      throw new Error("Veuillez d'abord changer votre code d'accès.");
    }
    return null;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Action non autorisée pour cet utilisateur.";
    // Code stable pour le renderer : session manquante vs permission.
    const code = /Session requise/i.test(message) ? "STAFF_SESSION_REQUIRED" : "STAFF_FORBIDDEN";
    return { ok: false, code, message };
  }
}

/**
 * Canaux bruts COUVERTS par la garde `enforceRawChannelGates`.
 *
 * G-01 / B-01 / G-12 (audit 2026-10-19) : cette liste n'était lue par AUCUN
 * code (constante décorative). Elle est désormais APPLIQUÉE par le test
 * `tests/unit/raw-guarded-channels.test.ts`, qui :
 *   1. scanne TOUS les fichiers `electron/` et en extrait les
 *      `ipcMain.handle(IPC_CHANNELS["x"])` (les canaux BRUTS) ;
 *   2. exige que cette liste soit EXACTEMENT l'ensemble des canaux bruts qui
 *      appellent `enforceRawChannelGates` (ni plus, ni moins) ;
 *   3. exige que tout canal brut non gardé figure dans
 *      `RAW_UNGUARDED_CHANNELS` avec une justification écrite.
 * ⇒ un nouveau handler brut sans porte fait désormais ÉCHOUER la suite.
 */
export const RAW_GUARDED_CHANNELS: readonly string[] = [
  IPC_CHANNELS["backup.create"],
  IPC_CHANNELS["backup.export"],
  IPC_CHANNELS["backup.autoSave"],
  IPC_CHANNELS["backup.restore"],
  IPC_CHANNELS["printing.printReceipt"],
  IPC_CHANNELS["printing.preview"],
  IPC_CHANNELS["printing.listPrinters"],
  IPC_CHANNELS["printer.save"],
  IPC_CHANNELS["printing.testPage"],
  IPC_CHANNELS["printing.previewProforma"],
  IPC_CHANNELS["printing.printProformaA4"],
  IPC_CHANNELS["printing.previewPayment"],
  IPC_CHANNELS["printing.printPayment"],
  IPC_CHANNELS["printing.previewDelivery"],
  IPC_CHANNELS["printing.printDelivery"],
  IPC_CHANNELS["printing.previewReturnSlip"],
  IPC_CHANNELS["printing.printReturnSlip"],
  IPC_CHANNELS["printing.previewPO"],
  IPC_CHANNELS["printing.printPO"],
  IPC_CHANNELS["printing.previewReport"],
  IPC_CHANNELS["printing.printReport"],
  IPC_CHANNELS["printing.previewLabels"],
  IPC_CHANNELS["printing.printLabels"],
  IPC_CHANNELS["printing.exportLabelsPdf"],
  IPC_CHANNELS["printing.exportReceiptPdf"],
  IPC_CHANNELS["printing.exportProformaPdf"],
  IPC_CHANNELS["printing.exportPaymentPdf"],
  IPC_CHANNELS["printing.exportReportPdf"],
  IPC_CHANNELS["templates.preview"],
  IPC_CHANNELS["templates.testPrint"],
  IPC_CHANNELS["ocr.selectFile"],
  IPC_CHANNELS["ocr.analyze"],
  IPC_CHANNELS["ocr.cancel"],
  IPC_CHANNELS["ocr.dispose"],
];

/**
 * Canaux bruts DÉLIBÉRÉMENT non gardés — chacun avec sa raison (G-12).
 * Toute ligne ajoutée ici est un choix explicite, revu à chaque vague.
 */
export const RAW_UNGUARDED_CHANNELS: Readonly<Record<string, string>> = {
  [IPC_CHANNELS["backup.list"]]:
    "Lecture non sensible : nom de fichier de sauvegarde + taille + horodatage (aucun chemin, aucun contenu). Volumétrie d'un seul dossier.",
  [IPC_CHANNELS["backup.status"]]:
    "Lecture non sensible (compteur + dernier nom de fichier + horodatage). Lue par le bandeau global de notifications, y compris AVANT session : la garder fermée perdrait l'alerte « sauvegarde en retard ».",
  [IPC_CHANNELS["recovery.retry"]]:
    "Chemin de reprise APRÈS CRASH : s'exécute avant toute session (base half-migrated, utilisateur incapable de se connecter). Une porte staff rendrait la reprise impossible.",
  [IPC_CHANNELS["recovery.exit"]]:
    "Chemin de reprise APRÈS CRASH : sortie de l'application vers l'assistant de reprise. Aucune donnée lue, aucune écriture.",
};
