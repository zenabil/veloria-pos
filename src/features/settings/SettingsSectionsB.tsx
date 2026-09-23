// Veloria PoS — Paramètres : sections Documents → Système (unifiées).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
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
}

export function InvoiceSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<InvoiceForm>("invoice");
  const [form, setForm] = useState<InvoiceForm>({
    showLogo: true,
    showCustomerBalance: true,
    showPreviousBalance: true,
    footerText: "",
    thankYouMessage: "",
  });
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) setForm(value);
  }, [value]);

  function save(): void {
    void run(async () => {
      try {
        await saveAppSettings("invoice", form);
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
  const { value } = useAppSettings<{ silent: boolean }>("printing");
  const [silent, setSilent] = useState(true);
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [selected, setSelected] = useState("");
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) setSilent(value.silent);
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
        await saveAppSettings("printing", { silent: v });
        notify("Impression enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function savePrinter(name: string): void {
    setSelected(name);
    void run(async () => {
      try {
        await api.printerSave({ name: name === "" ? null : name });
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

  return (
    <Section title="Impression" hint="Imprimante système + comportement.">
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
      <SwitchRow
        label="Impression silencieuse"
        hint="Coupé = dialogue système à chaque fois."
        checked={silent}
        onChange={saveSilent}
        ariaLabel="Impression silencieuse"
      />
      <p className="text-xs text-slate-500">
        Coupe papier et tiroir-caisse : non pilotés (impression HTML système).
      </p>
      <SaveBar busy={busy} onSave={test} label="Imprimer une page de test" />
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
  auto: { enabled: boolean; intervalDays: number };
}

interface BackupItem {
  file: string;
  size: number;
  createdAt: string;
}

export function BackupSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [list, setList] = useState<BackupItem[]>([]);
  const [interval, setInterval] = useState("1");
  const { busy, run } = useBusyFlag();
  const confirmAsync = useConfirm();

  function refresh(): void {
    api
      .backupStatus()
      .then((s) => {
        const st = s as BackupStatus;
        setStatus(st);
        setInterval(String(st.auto.intervalDays));
      })
      .catch(() => undefined);
    api
      .backupList()
      .then((r) => {
        if (Array.isArray(r)) setList(r as BackupItem[]);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggleAuto(v: boolean): void {
    void run(async () => {
      try {
        await api.backupAutoSave({ enabled: v, intervalDays: Number(interval) || 1 });
        notify("Sauvegarde auto mise à jour.", "ok");
        refresh();
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function changeInterval(v: string): void {
    setInterval(v);
    const days = Number(v);
    if (!Number.isInteger(days) || days < 1 || days > 30) return;
    void run(async () => {
      try {
        await api.backupAutoSave({ enabled: status?.auto.enabled ?? true, intervalDays: days });
        refresh();
      } catch {
        /* silencieux : le switch notifie */
      }
    });
  }

  function backupNow(): void {
    void run(async () => {
      try {
        await api.backupCreate();
        notify("Sauvegarde créée.", "ok");
        refresh();
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
          refresh();
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

  return (
    <Section title="Sauvegarde" hint="Copies VACUUM INTO (.vposdb), rotation 30.">
      <dl className="space-y-2.5">
        <InfoRow
          label="Dernière"
          value={status?.lastAt ? status.lastAt.slice(0, 16).replace("T", " ") : "—"}
        />
        <InfoRow label="Copies" value={String(status?.count ?? 0)} />
        <InfoRow label="Dossier" value="Données de l'application (fixe)" />
      </dl>
      <SwitchRow
        label="Sauvegarde automatique"
        hint="Au démarrage si l'intervalle est dépassé."
        checked={status?.auto.enabled ?? true}
        onChange={toggleAuto}
        ariaLabel="Sauvegarde automatique"
      />
      <Field
        label="Fréquence (jours, 1 – 30)"
        hint="Durée modifiable : sauvegarde auto au démarrage si dépassée."
      >
        <TextInput
          value={interval}
          onChange={(e) => changeInterval(e.target.value)}
          inputMode="numeric"
          placeholder="1"
          aria-label="Fréquence en jours"
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
// Base de données : emplacement, santé, optimisation, déplacement.
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}

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
        await api.dbRelocate({ folder: picked.folder });
        notify("Base déplacée.", "ok");
        refresh();
      } catch (e) {
        notify(frError(e, "Déplacement impossible."), "err");
      }
    });
  }

  function backupNow(): void {
    void run(async () => {
      try {
        await api.backupCreate();
        notify("Sauvegarde créée.", "ok");
      } catch (e) {
        notify(frError(e, "Échec de la sauvegarde."), "err");
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
          notify("Tapez REINITIALISER pour confirmer.", "err");
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
        <SaveBar busy={busy} onSave={backupNow} label="Sauvegarder" />
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
            <Field label="Tapez REINITIALISER pour confirmer">
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
        setNisab(p.nisabMinor > 0 ? (p.nisabMinor / 100).toString().replace(".", ",") : "");
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
        <InfoRow label="Email" value="zenaguibilal2@gmail.com" />
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
