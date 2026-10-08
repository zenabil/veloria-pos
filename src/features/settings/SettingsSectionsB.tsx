// Veloria PoS — Paramètres : sections Documents → Système (unifiées).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { minorToInput } from "@domain/money/money.ts";
import {
  BACKUP_FREQUENCIES,
  backupFrequencyFromAuto,
  backupFrequencyMinutes,
  type BackupFrequency,
} from "./backup-frequency.ts";
import { formatBytes } from "@shared/formatters/files.ts";
import { Field, Select, TextInput } from "@shared/ui/primitives.tsx";
import { Button, Modal } from "@shared/ui/primitives.tsx";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { newOperationId } from "@domain/common/ids.ts";
import { saveAppSettings, useAppSettings } from "@shared/settings/use-app-settings.ts";
import { confirmDeletesEnabled, setConfirmDeletesEnabled } from "@shared/ui/confirm.ts";
import { SaveBar, Section, SwitchRow, useBusyFlag } from "./bits.tsx";
import { InfoRow, type Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { licenseStateLabel } from "@features/license/types.ts";
import {
  callChecked,
  syncConfigViewSchema,
  syncPushResultSchema,
} from "@shared/types/ipc-contracts.ts";

function licenseInfoLabel(value: unknown): string {
  if (typeof value !== "object" || value === null) return "—";
  const lic = value as unknown as Record<string, unknown>;
  const state = typeof lic["state"] === "string" ? lic["state"] : "—";
  const edition = typeof lic["edition"] === "string" ? ` · ${lic["edition"]}` : "";
  return `${licenseStateLabel(state)}${edition}`;
}

// ---------------------------------------------------------------------------
// Facturation : contenu des documents.
// ---------------------------------------------------------------------------

interface InvoiceForm {
  showLogo: boolean;
  showCustomerBalance: boolean;
  showPreviousBalance: boolean;
  footerText: string;
  thankYouMessage: string;
  vatRate: number;
  defaultSeller: string;
  // Clés canoniques main (validators invoiceSettingsSchema) — écrites à chaque
  // save pour que TVA/vendeur s'appliquent aux impressions réelles (P1).
  tvaRatePercent: number;
  sellerDefault: string;
}

export function InvoiceSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<InvoiceForm>("invoice");
  const [form, setForm] = useState<InvoiceForm>({
    showLogo: true,
    showCustomerBalance: true,
    showPreviousBalance: true,
    footerText: "",
    thankYouMessage: "",
    vatRate: 0,
    defaultSeller: "",
    tvaRatePercent: 0,
    sellerDefault: "",
  });
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) {
      // Lecture bi-clés (anciennes bases vatRate/defaultSeller + canoniques
      // tvaRatePercent/sellerDefault) — l'UI édite vatRate/defaultSeller et
      // réplique les canoniques au save.
      const canonRate =
        typeof (value as Partial<InvoiceForm>).tvaRatePercent === "number"
          ? (value as Partial<InvoiceForm>).tvaRatePercent
          : undefined;
      const canonSeller =
        typeof (value as Partial<InvoiceForm>).sellerDefault === "string"
          ? (value as Partial<InvoiceForm>).sellerDefault
          : undefined;
      const legacyRate = typeof value.vatRate === "number" ? value.vatRate : 0;
      const legacySeller = typeof value.defaultSeller === "string" ? value.defaultSeller : "";
      const rate = canonRate ?? legacyRate;
      const seller = canonSeller ?? legacySeller;
      setForm((f) => ({
        ...f,
        ...value,
        footerText: typeof value.footerText === "string" ? value.footerText : "",
        thankYouMessage: typeof value.thankYouMessage === "string" ? value.thankYouMessage : "",
        vatRate: rate,
        defaultSeller: seller,
        tvaRatePercent: rate,
        sellerDefault: seller,
      }));
    }
  }, [value]);

  function save(): void {
    if (!Number.isFinite(form.vatRate) || form.vatRate < 0 || form.vatRate > 100) {
      notify("Taux TVA invalide (0 – 100).", "err");
      return;
    }
    if (form.defaultSeller.length > 100) {
      notify("Vendeur par défaut trop long (100 caractères max).", "err");
      return;
    }
    void run(async () => {
      try {
        await saveAppSettings("invoice", {
          ...form,
          vatRate: form.vatRate,
          defaultSeller: form.defaultSeller,
          tvaRatePercent: form.vatRate,
          sellerDefault: form.defaultSeller,
        });
        notify("Facturation enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Facturation" hint="Contenu des factures et tickets (aperçu immédiat).">
      <SwitchRow
        label="Logo sur les documents"
        hint="Depuis la fiche entreprise."
        checked={form.showLogo}
        onChange={(v) => setForm((f) => ({ ...f, showLogo: v }))}
        ariaLabel="Logo sur les documents"
      />
      <SwitchRow
        label="Afficher le solde client"
        hint="Solde actuel sur ticket/facture."
        checked={form.showCustomerBalance}
        onChange={(v) => setForm((f) => ({ ...f, showCustomerBalance: v }))}
        ariaLabel="Afficher le solde client"
      />
      <SwitchRow
        label="Afficher le solde précédent"
        hint="Ticket 80mm uniquement."
        checked={form.showPreviousBalance}
        onChange={(v) => setForm((f) => ({ ...f, showPreviousBalance: v }))}
        ariaLabel="Afficher le solde précédent"
      />
      <Field
        label="Taux TVA % (0 = sans TVA)"
        hint="Appliqué aux documents. 0 = montants hors TVA."
      >
        <TextInput
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={String(form.vatRate)}
          onChange={(e) => {
            const v = Number(e.target.value);
            setForm((f) => ({ ...f, vatRate: v, tvaRatePercent: v }));
          }}
          aria-label="Taux TVA en pourcent"
        />
      </Field>
      <Field label="Vendeur par défaut" hint="100 caractères maximum.">
        <TextInput
          value={form.defaultSeller}
          maxLength={100}
          onChange={(e) => {
            const v = e.target.value.slice(0, 100);
            setForm((f) => ({ ...f, defaultSeller: v, sellerDefault: v }));
          }}
          placeholder="Nom du vendeur"
          aria-label="Vendeur par défaut"
        />
      </Field>
      <Field label="Pied de page (A4)" hint="Vide = mentions légales seules.">
        <TextInput
          value={form.footerText}
          onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
          aria-label="Pied de page"
        />
      </Field>
      <Field label="Message de remerciement" hint="Vide = texte par défaut.">
        <TextInput
          value={form.thankYouMessage}
          onChange={(e) => setForm((f) => ({ ...f, thankYouMessage: e.target.value }))}
          aria-label="Message de remerciement"
        />
      </Field>
      <p className="text-xs text-slate-500">
        Montant en lettres et signatures toujours imprimés. Montants à 2 décimales.
      </p>
      <SaveBar busy={busy} onSave={save} label="Enregistrer la facturation" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Impression : imprimante, silence, test.
// ---------------------------------------------------------------------------

export function PrintingSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<{ silent: boolean; thermalWidth?: string }>("printing");
  const [silent, setSilent] = useState(true);
  const [thermalWidth, setThermalWidth] = useState<"58mm" | "80mm">("80mm");
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [selected, setSelected] = useState("");
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) {
      setSilent(value.silent);
      if (value.thermalWidth === "58mm" || value.thermalWidth === "80mm") {
        setThermalWidth(value.thermalWidth);
      }
    }
  }, [value]);

  useEffect(() => {
    api
      .printersList()
      .then((r) => {
        const d = r as {
          printers: { name: string; isDefault: boolean }[];
          selected: string | null;
        };
        setPrinters(d.printers);
        setSelected(d.selected ?? "");
      })
      .catch(() => undefined);
  }, []);

  function saveSilent(v: boolean): void {
    setSilent(v);
    void run(async () => {
      try {
        await saveAppSettings("printing", { silent: v, thermalWidth });
        notify("Impression enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function saveThermalWidth(v: "58mm" | "80mm"): void {
    setThermalWidth(v);
    void run(async () => {
      try {
        await saveAppSettings("printing", { silent, thermalWidth: v });
        notify("Largeur thermique enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function savePrinter(name: string): void {
    setSelected(name);
    void run(async () => {
      try {
        await api.printerSave({ name: name === "" ? null : name, operationId: newOperationId() });
        notify("Imprimante enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function test(): void {
    void run(async () => {
      try {
        await api.printerTest();
        notify("Page de test envoyée.", "ok");
      } catch (e) {
        notify(frError(e, "Impression impossible."), "err");
      }
    });
  }

  /** Stitch : Tester Connexions Matériel (sans gaspiller de papier). */
  function testHardware(): void {
    void run(async () => {
      const parts: string[] = [];
      try {
        const r = (await api.printersList()) as {
          printers: { name: string; isDefault: boolean }[];
        };
        parts.push(`Imprimantes détectées : ${r.printers.length}`);
      } catch {
        parts.push("Imprimantes : échec de détection");
      }
      try {
        const h = (await api.dbIntegrity()) as { integrity?: string };
        parts.push(`Base : ${h.integrity === "ok" ? "saine" : "à contrôler"}`);
      } catch {
        parts.push("Base : contrôle impossible");
      }
      try {
        const s = (await api.backupStatus()) as { count?: number; lastAt?: string | null };
        parts.push(`Sauvegardes : ${s.count ?? 0} (dernière ${s.lastAt ?? "—"})`);
      } catch {
        parts.push("Sauvegardes : état inconnu");
      }
      notify(`Matériel — ${parts.join(" · ")}.`, "ok");
    });
  }

  return (
    <Section
      title="Imprimante Thermique"
      hint="Imprimante système + tiroir-caisse + comportement (58/80mm)."
    >
      <Field label="Imprimante">
        <Select
          value={selected}
          onChange={(e) => savePrinter(e.target.value)}
          aria-label="Imprimante"
        >
          <option value="">Défaut système</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.isDefault ? " (défaut)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Largeur thermique" hint="Format des tickets (58 ou 80mm).">
        <Select
          value={thermalWidth}
          onChange={(e) => saveThermalWidth(e.target.value === "58mm" ? "58mm" : "80mm")}
          aria-label="Largeur thermique"
        >
          <option value="58mm">58mm</option>
          <option value="80mm">80mm</option>
        </Select>
      </Field>
      <SwitchRow
        label="Impression silencieuse"
        hint="Coupé = dialogue système à chaque fois."
        checked={silent}
        onChange={saveSilent}
        ariaLabel="Impression silencieuse"
      />
      <p className="text-xs text-slate-500">
        Tiroir-caisse RJ11 : impulsion via l&apos;imprimante (pilote système ESC/POS) — coupe papier
        et tiroir non pilotés directement (impression HTML système).
      </p>
      <div className="flex flex-wrap gap-2">
        <SaveBar busy={busy} onSave={test} label="Imprimer une page de test" />
        <SaveBar busy={busy} onSave={testHardware} label="Tester les connexions matériel" />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Sauvegarde : auto + manuelle + restauration.
// ---------------------------------------------------------------------------

interface BackupStatus {
  count: number;
  lastAt: string | null;
  lastFile: string | null;
  auto: {
    enabled: boolean;
    intervalDays?: number;
    frequency?: BackupFrequency;
    customMinutes?: number;
    retentionCount?: number;
  };
}

interface BackupItem {
  file: string;
  size: number;
  createdAt: string;
}

export function BackupSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [list, setList] = useState<BackupItem[]>([]);
  const [frequency, setFrequency] = useState<BackupFrequency>("daily");
  const [customMinutes, setCustomMinutes] = useState("60");
  const [retention, setRetention] = useState("30");
  const [staleAlert, setStaleAlert] = useState<string | null>(null);
  const { busy, run } = useBusyFlag();
  const confirmAsync = useConfirm();
  // Garde anti-course : une réponse périmée d'un refresh précédent ne doit
  // pas écraser l'état le plus récent (même motif que les autres écrans).
  const { next: nextSeq, isCurrent: isSeqCurrent } = useLoadSeq();

  /**
   * Écriture refusée tant que l'état serveur n'est pas chargé : jamais de
   * valeur devinée (sinon un échec de chargement réinitialiserait le réglage).
   */
  function statusOrRefuse(): BackupStatus | null {
    if (status === null) {
      notify("État des sauvegardes non chargé : patientez avant de modifier.", "err");
      return null;
    }
    return status;
  }

  function refresh(alertIfStale = true): void {
    const seq = nextSeq();
    api
      .backupStatus()
      .then((s) => {
        if (!isSeqCurrent(seq)) return;
        const st = s as BackupStatus;
        setStatus(st);
        const parsed = backupFrequencyFromAuto(st.auto);
        setFrequency(parsed.frequency);
        setCustomMinutes(String(parsed.customMinutes));
        const retentionCount =
          typeof st.auto.retentionCount === "number" && Number.isInteger(st.auto.retentionCount)
            ? st.auto.retentionCount
            : 30;
        setRetention(String(Math.min(100, Math.max(1, retentionCount))));
        if (alertIfStale) {
          const minutes = backupFrequencyMinutes(parsed.frequency, parsed.customMinutes);
          if (!st.lastAt) {
            const msg = "Aucune sauvegarde pour l'instant. Créez la première sauvegarde.";
            setStaleAlert(msg);
            notify(msg, "err");
          } else {
            const ageMin = (Date.now() - new Date(st.lastAt).getTime()) / 60000;
            if (Number.isFinite(ageMin) && ageMin > minutes) {
              const msg =
                "Dernière sauvegarde ancienne : dépasse la fréquence choisie. Créez une sauvegarde maintenant.";
              setStaleAlert(msg);
              notify(msg, "err");
            } else {
              setStaleAlert(null);
            }
          }
        }
      })
      .catch((e: unknown) => {
        if (!isSeqCurrent(seq)) return;
        console.error("[Veloria] sauvegarde : état illisible", e);
        notify(frError(e, "Lecture de l'état des sauvegardes impossible."), "err");
      });
    api
      .backupList()
      .then((r) => {
        if (!isSeqCurrent(seq)) return;
        if (Array.isArray(r)) setList(r as BackupItem[]);
      })
      .catch((e: unknown) => {
        if (!isSeqCurrent(seq)) return;
        console.error("[Veloria] sauvegarde : liste illisible", e);
        notify(frError(e, "Lecture de la liste des sauvegardes impossible."), "err");
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  function autoPayload(enabled: boolean): {
    enabled: boolean;
    frequency: BackupFrequency;
    customMinutes: number;
    retentionCount: number;
    intervalDays: number;
  } {
    const custom = Number(customMinutes);
    const retentionCount = Number(retention);
    return {
      enabled,
      frequency,
      customMinutes: frequency === "custom" && Number.isInteger(custom) ? custom : 60,
      retentionCount: Number.isInteger(retentionCount) ? retentionCount : 30,
      intervalDays: 1,
    };
  }

  function persistAuto(enabled: boolean): void {
    // Interdit tant que l'état n'est pas chargé : jamais de fréquence/rétention
    // devinée écrite en base (voir statusOrRefuse).
    if (statusOrRefuse() === null) return;
    const custom = Number(customMinutes);
    if (frequency === "custom" && (!Number.isInteger(custom) || custom < 5 || custom > 10080)) {
      notify("Fréquence personnalisée invalide (5 – 10080 minutes).", "err");
      return;
    }
    const retentionCount = Number(retention);
    if (!Number.isInteger(retentionCount) || retentionCount < 1 || retentionCount > 100) {
      notify("Rétention invalide (1 – 100 copies).", "err");
      return;
    }
    void run(async () => {
      try {
        await api.backupAutoSave({ ...autoPayload(enabled), operationId: newOperationId() });
        notify("Sauvegarde auto mise à jour.", "ok");
        refresh(false);
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function toggleAuto(v: boolean): void {
    persistAuto(v);
  }

  function changeFrequency(v: BackupFrequency): void {
    const st = statusOrRefuse();
    if (st === null) return;
    setFrequency(v);
    const custom = Number(customMinutes);
    if (v === "custom" && (!Number.isInteger(custom) || custom < 5 || custom > 10080)) {
      return;
    }
    const retentionCount = Number(retention);
    if (!Number.isInteger(retentionCount) || retentionCount < 1 || retentionCount > 100) {
      return;
    }
    void run(async () => {
      try {
        await api.backupAutoSave({
          enabled: st.auto.enabled,
          frequency: v,
          customMinutes: v === "custom" ? custom : 60,
          retentionCount,
          intervalDays: 1,
          operationId: newOperationId(),
        });
        refresh(false);
      } catch (e) {
        console.error("[Veloria] sauvegarde auto : fréquence non enregistrée", e);
        notify(frError(e, "Enregistrement de la fréquence impossible."), "err");
      }
    });
  }

  function changeCustomMinutes(v: string): void {
    const st = statusOrRefuse();
    if (st === null) return;
    setCustomMinutes(v);
    const custom = Number(v);
    if (!Number.isInteger(custom) || custom < 5 || custom > 10080) return;
    const retentionCount = Number(retention);
    if (!Number.isInteger(retentionCount) || retentionCount < 1 || retentionCount > 100) {
      return;
    }
    void run(async () => {
      try {
        await api.backupAutoSave({
          enabled: st.auto.enabled,
          frequency,
          customMinutes: custom,
          retentionCount,
          intervalDays: 1,
          operationId: newOperationId(),
        });
        refresh(false);
      } catch (e) {
        console.error("[Veloria] sauvegarde auto : fréquence personnalisée non enregistrée", e);
        notify(frError(e, "Enregistrement de la fréquence impossible."), "err");
      }
    });
  }

  function changeRetention(v: string): void {
    const st = statusOrRefuse();
    if (st === null) return;
    setRetention(v);
    const retentionCount = Number(v);
    if (!Number.isInteger(retentionCount) || retentionCount < 1 || retentionCount > 100) {
      return;
    }
    const custom = Number(customMinutes);
    void run(async () => {
      try {
        await api.backupAutoSave({
          enabled: st.auto.enabled,
          frequency,
          customMinutes: Number.isInteger(custom) ? custom : 60,
          retentionCount,
          intervalDays: 1,
          operationId: newOperationId(),
        });
        refresh(false);
      } catch (e) {
        console.error("[Veloria] sauvegarde auto : rétention non enregistrée", e);
        notify(frError(e, "Enregistrement de la rétention impossible."), "err");
      }
    });
  }

  function backupNow(): void {
    void run(async () => {
      try {
        await api.backupCreate();
        notify("Sauvegarde créée.", "ok");
        refresh(false);
      } catch (e) {
        notify(frError(e, "Échec de la sauvegarde."), "err");
      }
    });
  }

  function restore(file: string): void {
    void (async () => {
      if (
        !(await confirmAsync(
          "Restaurer cette sauvegarde ? La base actuelle est mise de côté avant remplacement.",
        ))
      )
        return;
      void run(async () => {
        try {
          await api.backupRestore({ file });
          notify("Base restaurée.", "ok");
          refresh(false);
        } catch (e) {
          notify(frError(e, "Restauration impossible."), "err");
        }
      });
    })();
  }

  function openFolder(): void {
    void run(async () => {
      try {
        await api.systemOpenDataFolder();
      } catch (e) {
        notify(frError(e, "Ouverture impossible."), "err");
      }
    });
  }

  // Export de la dernière sauvegarde vers un dossier choisi (canal déjà
  // testé côté main, sans bouton jusqu'ici : backup.export branché ici).
  function exportLast(): void {
    void run(async () => {
      try {
        const folder = (await api.systemSelectFolder()) as { folder: string | null };
        if (!folder.folder) return;
        const res = (await api.backupExport({ folder: folder.folder })) as { path: string };
        notify(`Sauvegarde exportée : ${res.path}`, "ok");
      } catch (e) {
        notify(frError(e, "Export impossible."), "err");
      }
    });
  }

  return (
    <Section title="Sauvegarde" hint="Copies VACUUM INTO (.vposdb), rotation paramétrable.">
      <dl className="space-y-2.5">
        <InfoRow
          label="Dernière"
          value={status?.lastAt ? status.lastAt.slice(0, 16).replace("T", " ") : "—"}
        />
        <InfoRow label="Copies" value={String(status?.count ?? 0)} />
        <InfoRow label="Dossier" value="Données de l'application (fixe)" />
      </dl>
      {staleAlert ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200"
        >
          {staleAlert}
        </p>
      ) : null}
      <SwitchRow
        label="Sauvegarde automatique"
        hint="Au démarrage si la fréquence est dépassée."
        checked={status?.auto.enabled ?? false}
        onChange={toggleAuto}
        ariaLabel="Sauvegarde automatique"
        disabled={status === null}
      />
      <Field label="Fréquence" hint="Durée modifiable : sauvegarde auto au démarrage si dépassée.">
        <Select
          value={frequency}
          onChange={(e) => changeFrequency(e.target.value as BackupFrequency)}
          aria-label="Fréquence de sauvegarde"
        >
          {BACKUP_FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </Field>
      {frequency === "custom" ? (
        <Field
          label="Fréquence personnalisée (minutes, 5 – 10080)"
          hint="Ex. 90 = toutes les 90 minutes."
        >
          <TextInput
            value={customMinutes}
            onChange={(e) => changeCustomMinutes(e.target.value)}
            inputMode="numeric"
            placeholder="60"
            aria-label="Fréquence personnalisée en minutes"
          />
        </Field>
      ) : null}
      <Field
        label="Rétention (copies conservées, 1 – 100)"
        hint="Les plus anciennes sont supprimées au-delà."
      >
        <TextInput
          value={retention}
          onChange={(e) => changeRetention(e.target.value)}
          inputMode="numeric"
          placeholder="30"
          aria-label="Rétention des sauvegardes"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SaveBar busy={busy} onSave={backupNow} label="Sauvegarder maintenant" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openFolder}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
        >
          Ouvrir le dossier
        </button>
        <button
          type="button"
          onClick={exportLast}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
        >
          Exporter la dernière sauvegarde
        </button>
      </div>
      {list.length > 0 ? (
        <ul className="max-h-44 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10 text-sm">
          {list.map((b) => (
            <li key={b.file} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs">
                  {b.file.split(/[/\\]/).pop()}
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  {b.createdAt.slice(0, 16).replace("T", " ")} · {(b.size / 1024).toFixed(0)} Ko
                </span>
              </span>
              <button
                type="button"
                onClick={() => restore(b.file)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold text-amber-200 hover:bg-amber-400/10"
              >
                Restaurer
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Miroir APK (V1 lecture seule) : configuration poussée + état + envoi manuel.
// La clé service ne revient jamais vers le renderer (masquée côté main).
// ---------------------------------------------------------------------------

interface SyncView {
  enabled: boolean;
  supabaseUrl: string;
  hasKey: boolean;
  hasAnonKey?: boolean | undefined;
  intervalMinutes: number;
  lastPushAt: string | null;
  lastError: string | null;
  pendingCount: number;
}

export function ClientSyncSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [anon, setAnon] = useState("");
  const [interval, setInterval] = useState("15");
  const [view, setView] = useState<SyncView | null>(null);
  const { busy, run } = useBusyFlag();

  function refresh(): void {
    callChecked((a) => a.sync.getConfig(), syncConfigViewSchema)
      .then((v) => {
        setView(v);
        setEnabled(v.enabled);
        setUrl(v.supabaseUrl);
        setInterval(String(v.intervalMinutes));
        setSecret("");
        setAnon("");
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    refresh();
  }, []);

  function save(): void {
    const minutes = Number(interval);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      notify("Cadence invalide (5 – 1440 minutes).", "err");
      return;
    }
    if (enabled && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url.trim())) {
      // Relais local (essais E2E/boucle locale) : http réservé au loopback
      // (même règle que validateSyncConfig côté main).
      if (!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(url.trim())) {
        notify("URL invalide (https://xxx.supabase.co).", "err");
        return;
      }
    }
    if (enabled && secret.trim() === "" && !view?.hasKey) {
      notify("Collez la clé service (réglage initial).", "err");
      return;
    }
    if (anon.trim() !== "" && (anon.trim().length < 20 || anon.trim().length > 500)) {
      notify("Clé anon invalide (20 – 500 caractères).", "err");
      return;
    }
    void run(async () => {
      try {
        await api.syncSaveConfig({
          operationId: newOperationId(),
          enabled,
          supabaseUrl: url.trim(),
          serviceKey: secret,
          anonKey: anon,
          intervalMinutes: minutes,
        });
        setSecret("");
        setAnon("");
        notify("Synchro enregistrée.", "ok");
        refresh();
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function pushNow(): void {
    void run(async () => {
      try {
        const r = await callChecked(
          (a) => a.sync.pushNow({ operationId: newOperationId() }),
          syncPushResultSchema,
        );
        notify(`Miroir poussé : ${r.pushed} cliché(s), ${r.access} accès.`, "ok");
        refresh();
      } catch (e) {
        notify(frError(e, "Poussée impossible."), "err");
        refresh();
      }
    });
  }

  return (
    <Section
      title="Miroir Android"
      hint="Application clients (lecture seule) : file locale → Supabase."
    >
      <dl className="space-y-2.5">
        <InfoRow
          label="Dernière poussée"
          value={view?.lastPushAt ? view.lastPushAt.slice(0, 16).replace("T", " ") : "—"}
        />
        <InfoRow label="En attente" value={String(view?.pendingCount ?? 0)} />
        <InfoRow
          label="Clé service"
          value={view?.hasKey ? "Enregistrée (vide = conserver)" : "Absente"}
        />
        <InfoRow
          label="Clé anon (QR V2)"
          value={view?.hasAnonKey ? "Enregistrée (vide = conserver)" : "Absente — QR V2 impossible"}
        />
        {view?.lastError ? <InfoRow label="Dernière erreur" value={view.lastError} /> : null}
      </dl>
      <SwitchRow
        label="Synchronisation activée"
        hint="Poussée auto toutes les N minutes + après chaque vente/paiement (file)."
        checked={enabled}
        onChange={setEnabled}
        ariaLabel="Synchronisation miroir"
      />
      <Field label="Adresse du serveur (URL)" hint="Ex. https://xxx.supabase.co">
        <TextInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="https://xxx.supabase.co"
          aria-label="Adresse du serveur (URL)"
        />
      </Field>
      <Field
        label="Clé de service (rôle service)"
        hint="Collée une fois, jamais réaffichée. Vide = conserver."
      >
        <TextInput
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={view?.hasKey ? "•••••••• (conserver)" : "Collez la clé…"}
          aria-label="Clé service Supabase"
        />
      </Field>
      <Field
        label="Clé anon (publique)"
        hint="Projet Supabase → Settings → API → anon public. Embarquée dans le QR V2 (un seul APK pour tous les magasins). Vide = conserver."
      >
        <TextInput
          value={anon}
          onChange={(e) => setAnon(e.target.value)}
          placeholder={view?.hasAnonKey ? "•••••••• (conserver)" : "Collez la clé anon…"}
          aria-label="Clé anon Supabase"
        />
      </Field>
      <Field
        label="Cadence auto (minutes, 5 – 1440)"
        hint="15 = toutes les 15 minutes (quota gratuit)."
      >
        <TextInput
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          inputMode="numeric"
          placeholder="15"
          aria-label="Cadence de poussée"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <SaveBar busy={busy} onSave={save} label="Enregistrer" />
        <SaveBar busy={busy} onSave={pushNow} label="Pousser maintenant" />
      </div>
      <p className="text-xs text-slate-500">
        SQLite reste le master. Le miroir est jetable et reconstructible (file rejouée).
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Base de données : emplacement, santé, optimisation, déplacement.
// ---------------------------------------------------------------------------

export function DatabaseSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [location, setLocation] = useState<{ path: string; folder: string } | null>(null);
  const [health, setHealth] = useState<{
    integrity: string;
    foreignKeyViolations: unknown[];
    schemaVersion: number;
  } | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const { busy, run } = useBusyFlag();
  const confirmAsync = useConfirm();

  function refresh(): void {
    api
      .dbLocation()
      .then((l) => setLocation(l as { path: string; folder: string }))
      .catch(() => undefined);
    api
      .appDiagnostics()
      .then((d) => {
        const diag = d as { dbSize: number; schemaVersion: number; integrity: string };
        setSize(diag.dbSize);
        setHealth({
          integrity: diag.integrity,
          foreignKeyViolations: [],
          schemaVersion: diag.schemaVersion,
        });
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    refresh();
  }, []);

  function check(): void {
    void run(async () => {
      try {
        const h = (await api.dbHealth()) as { integrity: string };
        notify(
          h.integrity === "ok" ? "Base saine." : "Anomalie détectée.",
          h.integrity === "ok" ? "ok" : "err",
        );
        refresh();
      } catch (e) {
        notify(frError(e, "Contrôle impossible."), "err");
      }
    });
  }

  function optimize(): void {
    void run(async () => {
      try {
        const r = (await api.dbOptimize()) as { beforeBytes: number; afterBytes: number };
        notify(`Optimisée : ${formatBytes(r.beforeBytes)} → ${formatBytes(r.afterBytes)}.`, "ok");
        refresh();
      } catch (e) {
        notify(frError(e, "Optimisation impossible."), "err");
      }
    });
  }

  function relocate(): void {
    void run(async () => {
      try {
        const picked = (await api.systemSelectFolder()) as { folder: string | null };
        if (!picked.folder) return;
        if (
          !(await confirmAsync(
            `Déplacer la base vers « ${picked.folder} » ? L'application redémarrera sur la copie vérifiée.`,
          ))
        )
          return;
        await api.dbRelocate({ folder: picked.folder, operationId: newOperationId() });
        notify("Base déplacée.", "ok");
        refresh();
      } catch (e) {
        notify(frError(e, "Déplacement impossible."), "err");
      }
    });
  }

  // Zone dangereuse : réinitialisation d'usine (base VIERGE, sauvegardes
  // *.vposdb conservées). Double verrou : confirmation tapée
  // « REINITIALISER » côté renderer + preuve littérale exigée côté main.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");

  function resetFactory(): void {
    void run(async () => {
      try {
        if (resetText.trim() !== "REINITIALISER") {
          notify("Tapez REINITIALISER pour confirmer (en majuscules, sans accent).", "err");
          return;
        }
        setResetOpen(false);
        setResetText("");
        await api.dbReset({ confirmation: "REINITIALISER", operationId: newOperationId() });
        notify("Base réinitialisée. Redémarrage…", "ok");
        await api.appRestart();
      } catch (e) {
        notify(frError(e, "Réinitialisation impossible."), "err");
      }
    });
  }

  return (
    <Section title="Base de données" hint="SQLite locale, source unique de vérité.">
      <dl className="space-y-2.5">
        <InfoRow label="Emplacement" value={location?.path ?? "—"} />
        <InfoRow label="Taille" value={size == null ? "—" : formatBytes(size)} />
        <InfoRow label="Schéma" value={health ? `v${health.schemaVersion}` : "—"} />
        <InfoRow
          label="Santé"
          value={health ? (health.integrity === "ok" ? "Saine" : health.integrity) : "—"}
        />
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <SaveBar busy={busy} onSave={check} label="Vérifier" />
        <SaveBar busy={busy} onSave={optimize} label="Optimiser" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SaveBar busy={busy} onSave={relocate} label="Déplacer…" />
      </div>
      <p className="text-xs text-slate-500">
        Optimiser = VACUUM + ANALYZE (compacte, ne supprime rien). Déplacer = copie vérifiée puis
        bascule.
      </p>
      <div className="rounded-xl border border-red-500/40 bg-[#1c1113] p-4">
        <div className="text-sm font-extrabold text-red-200">Zone dangereuse</div>
        <p className="mt-1 text-xs text-slate-400">
          Réinitialiser efface TOUTES les données courantes (base vierge). Les sauvegardes *.vposdb
          sont conservées.
        </p>
        <div className="mt-2">
          <SaveBar busy={busy} onSave={() => setResetOpen(true)} label="Réinitialiser…" danger />
        </div>
      </div>
      {resetOpen ? (
        <Modal
          label="Réinitialisation d'usine"
          title="Réinitialisation d'usine"
          onClose={() => {
            setResetOpen(false);
            setResetText("");
          }}
        >
          <div className="space-y-4">
            <p role="alert" className="text-sm font-bold text-red-200">
              Action IRRÉVERSIBLE : toutes les ventes, produits, clients et dettes seront effacés.
              Faites une sauvegarde avant.
            </p>
            <Field label="Tapez REINITIALISER pour confirmer (sans accent)">
              <TextInput
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
                placeholder="REINITIALISER"
                aria-label="Confirmation de réinitialisation"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setResetOpen(false);
                  setResetText("");
                }}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                type="button"
                disabled={busy || resetText.trim() !== "REINITIALISER"}
                onClick={resetFactory}
                className="flex-[2]"
              >
                {busy ? "Réinitialisation…" : "Tout effacer"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Sécurité : confirmation suppressions + état d'intégrité.
// ---------------------------------------------------------------------------

export function SecuritySection({ notify }: { notify: Notify }): React.JSX.Element {
  const [confirm, setConfirm] = useState(confirmDeletesEnabled());
  const [integrity, setIntegrity] = useState<string | null>(null);

  useEffect(() => {
    api
      .appDiagnostics()
      .then((d) => {
        const integrity = (d as { integrity: unknown }).integrity;
        setIntegrity(typeof integrity === "string" ? integrity : "—");
      })
      .catch(() => undefined);
  }, []);

  function toggle(v: boolean): void {
    setConfirmDeletesEnabled(v);
    setConfirm(v);
    notify(v ? "Confirmations activées." : "Confirmations désactivées.", "ok");
  }

  return (
    <Section title="Sécurité" hint="Garde-fous destructifs + état réel.">
      <SwitchRow
        label="Confirmer avant suppression"
        hint="Annulations et suppressions définitives."
        checked={confirm}
        onChange={toggle}
        ariaLabel="Confirmer avant suppression"
      />
      <dl className="space-y-2.5">
        <InfoRow label="Intégrité base" value={integrity ?? "—"} />
        <InfoRow label="Données" value="SQLite locale + sauvegardes .vposdb" />
      </dl>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Zakat : paramètres déplacés depuis l'écran Zakat (taux, nisab, hawl).
// L'écran Zakat garde calcul + historique (reporting seul).
// ---------------------------------------------------------------------------

interface ZakatParams {
  ratePercent: number;
  nisabMinor: number;
  hawlDate: string | null;
  nisabMethod: string;
}

export function ZakatSettingsSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [rate, setRate] = useState("2,5");
  const [nisab, setNisab] = useState("");
  const [hawl, setHawl] = useState("");
  const [method, setMethod] = useState("gold");
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    api
      .zakatSources()
      .then((s) => {
        const p = (s as { params: ZakatParams }).params;
        setRate(String(p.ratePercent).replace(".", ","));
        setNisab(p.nisabMinor > 0 ? minorToInput(p.nisabMinor) : "");
        setHawl(p.hawlDate ?? "");
        setMethod(p.nisabMethod);
      })
      .catch(() => undefined);
  }, []);

  function save(): void {
    const rateNum = Number(rate.replace(",", "."));
    // P1-5 : strict (bornes H-1, jamais NaN).
    const nisabMinor = strictOrNeg(nisab, "Nisab");
    if (!Number.isFinite(rateNum) || rateNum < 0.1 || rateNum > 100) {
      notify("Taux invalide (0,1 – 100).", "err");
      return;
    }
    if (!Number.isInteger(nisabMinor) || nisabMinor < 0) {
      notify("Nisab invalide.", "err");
      return;
    }
    void run(async () => {
      try {
        await api.zakatSave({
          ratePercent: Math.round(rateNum * 100) / 100,
          nisabMinor,
          hawlDate: hawl === "" ? null : hawl,
          nisabMethod: method,
        });
        notify("Paramètres zakat enregistrés.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Zakat" hint="Paramètres du calcul (l'écran Zakat garde calcul + historique).">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Taux (%) *">
          <TextInput
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="2,5"
            aria-label="Taux zakat"
          />
        </Field>
        <Field label="Nisab (DZD)">
          <TextInput
            value={nisab}
            onChange={(e) => setNisab(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Nisab"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date du Hawl" hint="Début de l'année lunaire.">
          <TextInput
            type="date"
            value={hawl}
            onChange={(e) => setHawl(e.target.value)}
            aria-label="Date du Hawl"
          />
        </Field>
        <Field label="Méthode du nisab">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            aria-label="Méthode du nisab"
          >
            <option value="gold">Or</option>
            <option value="silver">Argent</option>
            <option value="other">Autre</option>
          </Select>
        </Field>
      </div>
      <SaveBar busy={busy} onSave={save} label="Enregistrer la zakat" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// À propos : versions, développeur, dossiers.
// ---------------------------------------------------------------------------

export function AboutSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [diag, setDiag] = useState<Record<string, string | number> | null>(null);
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    api
      .appDiagnostics()
      .then((d) => setDiag(d as Record<string, string | number>))
      .catch(() => undefined);
  }, []);

  function openData(): void {
    void run(async () => {
      try {
        await api.systemOpenDataFolder();
      } catch (e) {
        notify(frError(e, "Ouverture impossible."), "err");
      }
    });
  }

  function openLogs(): void {
    void run(async () => {
      try {
        await api.systemOpenLogsFolder();
      } catch (e) {
        notify(frError(e, "Ouverture impossible."), "err");
      }
    });
  }

  return (
    <Section title="À propos" hint="Produit, base, système et développeur.">
      <dl className="space-y-2.5">
        <InfoRow label="Application" value={`Veloria POS ${String(diag?.["version"] ?? "—")}`} />
        <InfoRow
          label="Base"
          value={diag ? `v${String(diag["schemaVersion"])} · ${String(diag["integrity"])}` : "—"}
        />
        <InfoRow
          label="Taille base"
          value={
            typeof diag?.["dbSize"] === "number" ? `${(diag["dbSize"] / 1024).toFixed(1)} Ko` : "—"
          }
        />
        <InfoRow label="Electron" value={String(diag?.["electron"] ?? "—")} />
        <InfoRow label="Système" value={String(diag?.["os"] ?? "—")} />
        <InfoRow label="Licence" value={licenseInfoLabel(diag?.["license"])} />
      </dl>
      <dl className="space-y-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
        <InfoRow label="Produit" value="Veloria POS V 1.0.0" />
        <InfoRow
          label="Présentation"
          value="Caisse enregistreuse pour commerces de détail : ventes, stock, clients, fournisseurs, dettes et rapports — simple, rapide et 100 % hors-ligne."
        />
        <InfoRow
          label="Base de données"
          value="SQLite — fichier local unique, sans serveur ni internet"
        />
        <InfoRow label="Développeur" value="zenagui bilal" />
        <InfoRow label="Téléphone" value="+213770204047" />
        <InfoRow label="E-mail" value="zenaguibilal2@gmail.com" />
        <InfoRow
          label="Support"
          value="Sauvegarde .vposdb + journaux (ci-dessous) avant tout signalement"
        />
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <SaveBar busy={busy} onSave={openData} label="Dossier données" />
        <SaveBar busy={busy} onSave={openLogs} label="Journaux" />
      </div>
    </Section>
  );
}
