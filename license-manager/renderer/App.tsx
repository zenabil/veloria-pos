// Veloria License Manager — UI vendor (FR). Création, renouvellement,
// transfert, suspension, révocation, capabilities, export .vlic, sauvegardes.
// Aucune clé affichée. Confirmations inline (jamais window.prompt/confirm).
import { useCallback, useEffect, useState } from "react";
import { mapi } from "./ipc-client.ts";

type Tab = "list" | "new" | "backups";

interface LicenseRow {
  id: number;
  license_id: string;
  customer_ref: string;
  client_id: string | null;
  client_name: string | null;
  store_name: string | null;
  edition: string;
  plan: string | null;
  license_type: string;
  license_status: string | null;
  device_binding: number | null;
  max_devices: number | null;
  hardware_fingerprint: string;
  starts_at: string;
  expires_at: string | null;
  features_json: string;
  pages_json: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface BackupRow {
  file: string;
  size: number;
  createdAt: string;
}

interface ConfirmState {
  title: string;
  message: string;
  danger?: boolean;
  inputLabel?: string;
  inputValue: string;
  inputPlaceholder?: string;
  input2Label?: string;
  input2Value: string;
  input2Placeholder?: string;
  confirmLabel: string;
  onConfirm: (v1: string, v2: string) => void;
}

const PLANS = ["BASIC", "STANDARD", "PRO", "ENTERPRISE", "CUSTOM"] as const;

const EDITION_FROM_PLAN: Record<string, string> = {
  BASIC: "basic",
  STANDARD: "standard",
  PRO: "pro",
  ENTERPRISE: "enterprise",
  CUSTOM: "custom",
};

const PAGES: { id: string; fr: string }[] = [
  { id: "dashboard", fr: "Tableau de bord" },
  { id: "sales", fr: "Ventes" },
  { id: "products", fr: "Produits" },
  { id: "stock", fr: "Stock" },
  { id: "customers", fr: "Clients" },
  { id: "suppliers", fr: "Fournisseurs" },
  { id: "debts", fr: "Dettes" },
  { id: "expenses", fr: "Dépenses" },
  { id: "returns", fr: "Retours" },
  { id: "history", fr: "Historique" },
  { id: "reports", fr: "Rapports" },
  { id: "pain", fr: "Pain" },
  { id: "breadOrders", fr: "Commandes pain" },
  { id: "proformas", fr: "Proformas" },
  { id: "invoices", fr: "Factures" },
  { id: "zakat", fr: "Zakat" },
  { id: "settings", fr: "Paramètres" },
];

const FEATURES: { id: string; fr: string }[] = [
  { id: "receipt-80mm", fr: "Ticket 80mm" },
  { id: "invoice-a4", fr: "Facture A4" },
  { id: "automatic-backup", fr: "Sauvegarde auto" },
  { id: "restore-backup", fr: "Restauration" },
  { id: "barcode-scanner", fr: "Codes-barres" },
  { id: "ocr", fr: "OCR" },
  { id: "excel-export", fr: "Export Excel" },
  { id: "pdf-export", fr: "Export PDF" },
  { id: "debt-management", fr: "Dettes" },
  { id: "partial-payments", fr: "Paiements partiels" },
  { id: "returns", fr: "Retours" },
  { id: "proformas", fr: "Proformas" },
  { id: "advanced-reports", fr: "Rapports avancés" },
  { id: "multi-printer", fr: "Multi-imprimante" },
];

/** Presets locaux (miroir des presets main — l'émission signe le choix final). */
const PRESETS: Record<string, { pages: string[]; features: string[] }> = {
  BASIC: {
    pages: ["dashboard", "sales", "products", "stock", "customers", "history", "settings"],
    features: ["receipt-80mm", "automatic-backup"],
  },
  STANDARD: {
    pages: [
      "dashboard",
      "sales",
      "products",
      "stock",
      "customers",
      "suppliers",
      "debts",
      "expenses",
      "returns",
      "history",
      "proformas",
      "invoices",
      "settings",
    ],
    features: [
      "receipt-80mm",
      "invoice-a4",
      "automatic-backup",
      "restore-backup",
      "barcode-scanner",
      "pdf-export",
      "debt-management",
      "partial-payments",
      "returns",
      "proformas",
    ],
  },
  PRO: {
    pages: [
      "dashboard",
      "sales",
      "products",
      "stock",
      "customers",
      "suppliers",
      "debts",
      "expenses",
      "returns",
      "history",
      "reports",
      "pain",
      "breadOrders",
      "proformas",
      "invoices",
      "settings",
    ],
    features: [
      "receipt-80mm",
      "invoice-a4",
      "automatic-backup",
      "restore-backup",
      "barcode-scanner",
      "ocr",
      "excel-export",
      "pdf-export",
      "debt-management",
      "partial-payments",
      "returns",
      "proformas",
      "advanced-reports",
    ],
  },
  ENTERPRISE: {
    pages: PAGES.map((p) => p.id),
    features: FEATURES.map((f) => f.id),
  },
  CUSTOM: {
    pages: PAGES.map((p) => p.id),
    features: FEATURES.map((f) => f.id),
  },
};

const DURATIONS = [
  { months: 1, label: "1 mois" },
  { months: 6, label: "6 mois" },
  { months: 12, label: "1 an" },
] as const;

const input =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400/60";
const btn =
  "rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50";
const btnDanger =
  "rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50";
const label = "mb-1 block text-xs font-semibold text-slate-400";
const sectionTitle = "text-xs font-extrabold uppercase tracking-wider text-amber-300/90";

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function eventSummary(e: { event: string; details_json?: unknown }): string {
  if (typeof e.details_json !== "string") return e.event;
  try {
    const d = JSON.parse(e.details_json) as Record<string, unknown>;
    const parts = Object.entries(d)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${String(v).slice(0, 24)}`);
    return parts.length > 0 ? `${e.event} (${parts.join(", ")})` : e.event;
  } catch {
    return e.event;
  }
}

export function ManagerApp(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("list");
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ license: LicenseRow; events: unknown[] } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [capsEdit, setCapsEdit] = useState<{ pages: string[]; features: string[] } | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);

  // Formulaire création — identité client
  const [customerRef, setCustomerRef] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [storeName, setStoreName] = useState("");
  // Licence
  const [plan, setPlan] = useState<string>("PRO");
  const [duration, setDuration] = useState<string>("12");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [maxDevices, setMaxDevices] = useState("1");
  const [deviceBinding, setDeviceBinding] = useState(true);
  const [fingerprint, setFingerprint] = useState("");
  const [pages, setPages] = useState<string[]>(PRESETS["PRO"]?.pages ?? []);
  const [features, setFeatures] = useState<string[]>(PRESETS["PRO"]?.features ?? []);
  const [notes, setNotes] = useState("");

  const say = (t: string): void => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4500);
  };

  const loadList = useCallback((q: string) => {
    mapi
      .licensesList(q.trim() === "" ? undefined : { query: q.trim() })
      .then((l) => {
        const d = l as { rows: LicenseRow[]; total: number };
        setRows(d.rows ?? []);
        setTotal(typeof d.total === "number" ? d.total : (d.rows ?? []).length);
      })
      .catch(() => undefined);
  }, []);

  const refresh = useCallback(() => {
    mapi
      .keyStatus()
      .then((k) => setKeyOk((k as { configured: boolean }).configured))
      .catch(() => setKeyOk(false));
    loadList(query);
  }, [loadList, query]);

  const loadBackups = useCallback(() => {
    mapi
      .backups()
      .then((b) => setBackups(((b as { backups: BackupRow[] }).backups ?? []) as BackupRow[]))
      .catch(() => setBackups([]));
  }, []);

  // P3 : sauvegarde du registre vendor (aucun secret dedans : clé hors base).
  async function backupNow(): Promise<void> {
    setBusy(true);
    try {
      const r = (await mapi.backup()) as { file: string; size: number };
      say(`Registre sauvegardé (${Math.round(r.size / 1024)} Ko).`);
      loadBackups();
    } catch {
      say("Sauvegarde impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreNow(file: string): Promise<void> {
    setBusy(true);
    try {
      await mapi.restore({ file });
      say("Registre restauré.");
      refresh();
    } catch (e) {
      say(e instanceof Error ? e.message : "Restauration impossible.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === "backups") loadBackups();
  }, [tab, loadBackups]);

  useEffect(() => {
    if (selected == null) {
      setDetail(null);
      setDetailError(null);
      setCapsEdit(null);
      return;
    }
    mapi
      .licenseDetail({ id: selected })
      .then((d) => {
        setDetail(d as { license: LicenseRow; events: unknown[] });
        setDetailError(null);
        setCapsEdit(null);
      })
      .catch((e: unknown) => {
        setDetail(null);
        setDetailError(e instanceof Error ? e.message : "Détail indisponible.");
      });
  }, [selected]);

  function reloadDetail(): void {
    if (selected == null) return;
    mapi
      .licenseDetail({ id: selected })
      .then((d) => {
        setDetail(d as { license: LicenseRow; events: unknown[] });
        setCapsEdit(null);
      })
      .catch(() => undefined);
  }

  function applyPlan(p: string): void {
    setPlan(p);
    const preset = PRESETS[p] ?? PRESETS["CUSTOM"];
    if (preset) {
      setPages([...preset.pages]);
      setFeatures([...preset.features]);
    }
  }

  // Import guidé de la clé privée (premier lancement) : dialogue main →
  // copie validée (chiffrée DPAPI si disponible). Écrasement = confirmation.
  async function importKey(force = false): Promise<void> {
    setBusy(true);
    try {
      const r = (await mapi.keyImport(force ? { force: true } : undefined)) as {
        imported: boolean;
        exists?: boolean;
        encrypted?: boolean;
        configured: boolean;
      };
      if (r.exists && !r.imported) {
        setConfirm({
          title: "Remplacer la clé privée ?",
          message:
            "Une clé vendor existe déjà. La remplacer invalide toute re-signature future avec l'ancienne clé. Continuer ?",
          danger: true,
          inputValue: "",
          input2Value: "",
          confirmLabel: "Remplacer",
          onConfirm: () => {
            setConfirm(null);
            void importKey(true);
          },
        });
      } else if (r.imported && r.configured) {
        say(r.encrypted ? "Clé privée installée (chiffrée)." : "Clé privée installée.");
      } else if (!r.imported) {
        say("Import annulé.");
      } else {
        say("Clé importée mais illisible : vérifiez le fichier.");
      }
      refresh();
    } catch (e) {
      say(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function create(): Promise<void> {
    setBusy(true);
    try {
      const isLifetime = duration === "lifetime";
      const isCustom = duration === "custom";
      let maxDevicesValue: number | null = null;
      if (maxDevices.trim() !== "") {
        const n = Number(maxDevices.trim());
        if (!Number.isInteger(n) || n < 1 || n > 99) {
          say("Appareils max invalide : saisissez un nombre entier entre 1 et 99 (vide = défaut).");
          return;
        }
        maxDevicesValue = n;
      }
      const fp = fingerprint.trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(fp)) {
        say("Empreinte invalide : 64 caractères hexadécimaux attendus.");
        return;
      }
      const payload: Record<string, unknown> = {
        customerRef: customerRef.trim(),
        clientId: clientId.trim() === "" ? null : clientId.trim(),
        clientName: clientName.trim() === "" ? null : clientName.trim(),
        storeName: storeName.trim() === "" ? null : storeName.trim(),
        edition: EDITION_FROM_PLAN[plan] ?? "pro",
        plan,
        licenseType: isLifetime ? "lifetime" : "term",
        licenseStatus: "active",
        deviceBinding,
        maxDevices: maxDevicesValue,
        hardwareFingerprint: fp,
        features,
        pages: Object.fromEntries(PAGES.map((p) => [p.id, pages.includes(p.id)])),
        notes: notes.trim() === "" ? null : notes.trim(),
      };
      if (!isLifetime) {
        if (isCustom) {
          payload["startsAt"] = customStart;
          payload["expiresAt"] = customEnd;
        } else {
          payload["durationMonths"] = Number(duration);
        }
      }
      const r = (await mapi.licenseCreate(payload)) as { licenseId: string };
      say(`Licence ${r.licenseId} créée. Exportez le .vlic.`);
      setTab("list");
      refresh();
    } catch (e) {
      say(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function runStanding(status: "suspended" | "active"): Promise<void> {
    if (selected == null) return;
    setBusy(true);
    try {
      await mapi.licenseStanding({ id: selected, status });
      say(status === "suspended" ? "Licence suspendue." : "Licence réactivée.");
      refresh();
      reloadDetail();
    } catch (e) {
      say(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function runRevoke(): Promise<void> {
    if (selected == null) return;
    setBusy(true);
    try {
      await mapi.licenseRevoke({ id: selected });
      say("Licence révoquée.");
      refresh();
      reloadDetail();
    } catch (e) {
      say(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function runRenew(monthsRaw: string): Promise<void> {
    if (selected == null) return;
    setBusy(true);
    try {
      if (monthsRaw.trim() === "") {
        await mapi.licenseRenew({ id: selected, licenseType: "lifetime" });
      } else {
        const n = Number(monthsRaw.trim());
        if (!Number.isInteger(n) || n < 1 || n > 120) {
          say("Durée invalide : saisissez un nombre entier de mois entre 1 et 120.");
          return;
        }
        await mapi.licenseRenew({ id: selected, licenseType: "term", durationMonths: n });
      }
      say("Licence renouvelée.");
      refresh();
      reloadDetail();
    } catch (e) {
      say(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function runTransfer(fpRaw: string, reasonRaw: string): Promise<void> {
    if (selected == null) return;
    const clean = fpRaw.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(clean)) {
      say("Empreinte invalide : 64 caractères hexadécimaux attendus.");
      return;
    }
    setBusy(true);
    try {
      await mapi.licenseTransfer({
        id: selected,
        newFingerprint: clean,
        reason: reasonRaw.trim() === "" ? "transfert poste" : reasonRaw.trim().slice(0, 500),
      });
      say("Licence transférée (ancien poste invalidé).");
      refresh();
      reloadDetail();
    } catch (e) {
      say(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function runExport(): Promise<void> {
    if (selected == null) return;
    setBusy(true);
    try {
      const r = (await mapi.licenseExport({ id: selected })) as {
        exported: boolean;
        path: string | null;
      };
      say(r.exported ? `Exportée : ${r.path}` : "Export annulé.");
    } catch (e) {
      say(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCaps(): Promise<void> {
    if (selected == null || capsEdit == null) return;
    if (capsEdit.features.length === 0) {
      say("Capabilities : au moins 1 fonction requise.");
      return;
    }
    setBusy(true);
    try {
      await mapi.licenseCapabilities({
        id: selected,
        features: capsEdit.features,
        pages: Object.fromEntries(PAGES.map((p) => [p.id, capsEdit.pages.includes(p.id)])),
      });
      say("Accès mis à jour (exportez le nouveau .vlic).");
      refresh();
      reloadDetail();
    } catch (e) {
      say(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  function askConfirm(c: ConfirmState): void {
    setConfirm({ ...c, inputValue: c.inputValue ?? "", input2Value: c.input2Value ?? "" });
  }

  const status = detail?.license.status ?? null;
  const revoked = status === "revoked";
  const suspended = status === "suspended";
  const fpValid = /^[a-f0-9]{64}$/i.test(fingerprint.trim());
  const derivedEdition = EDITION_FROM_PLAN[plan] ?? "pro";

  return (
    <div className="min-h-screen bg-[#0c1220] p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Veloria License Manager</h1>
            <p className="text-xs text-slate-500">
              Outil vendor — création et gestion des licences hors-ligne.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("list")}
              className={tab === "list" ? btn : btnGhost}
            >
              Licences
            </button>
            <button
              type="button"
              onClick={() => setTab("new")}
              className={tab === "new" ? btn : btnGhost}
            >
              Nouvelle licence
            </button>
            <button
              type="button"
              onClick={() => setTab("backups")}
              className={tab === "backups" ? btn : btnGhost}
              title="Sauvegardes et restauration du registre"
            >
              Sauvegardes
            </button>
            <button
              type="button"
              onClick={() => void backupNow()}
              disabled={busy}
              className={btnGhost}
              title="Sauvegarder le registre vendor (rotation 10)"
            >
              Sauvegarder
            </button>
          </div>
        </header>

        {keyOk === false ? (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-[#1c1113] px-4 py-3 text-sm text-red-100"
          >
            <p className="font-bold">Clé privée vendor absente.</p>
            <p className="mt-1 text-red-200/80">
              Importez-la une seule fois : elle sera copiée chiffrée dans le dossier keys du Manager
              (jamais affichée, jamais exportée).
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void importKey()}
              className="mt-2 rounded-lg bg-red-400 px-4 py-2 text-sm font-bold text-black hover:bg-red-300 disabled:opacity-50"
            >
              Importer la clé privée…
            </button>
          </div>
        ) : null}
        {toast ? (
          <div
            role="status"
            className="rounded-xl border border-amber-400/30 bg-[#171207] px-4 py-2.5 text-sm text-amber-100"
          >
            {toast}
          </div>
        ) : null}

        {confirm ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={confirm.title}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          >
            <div className="w-full max-w-md space-y-3 rounded-xl border border-white/10 bg-[#0a0f1c] p-5">
              <h2 className="text-base font-bold">{confirm.title}</h2>
              <p className="text-sm text-slate-300">{confirm.message}</p>
              {confirm.inputLabel ? (
                <div>
                  <span className={label}>{confirm.inputLabel}</span>
                  <input
                    className={input + " font-mono"}
                    value={confirm.inputValue}
                    onChange={(e) => setConfirm({ ...confirm, inputValue: e.target.value })}
                    placeholder={confirm.inputPlaceholder ?? ""}
                  />
                </div>
              ) : null}
              {confirm.input2Label ? (
                <div>
                  <span className={label}>{confirm.input2Label}</span>
                  <input
                    className={input}
                    value={confirm.input2Value}
                    onChange={(e) => setConfirm({ ...confirm, input2Value: e.target.value })}
                    placeholder={confirm.input2Placeholder ?? ""}
                  />
                </div>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  className={btnGhost}
                  disabled={busy}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const c = confirm;
                    setConfirm(null);
                    void (async () => {
                      setBusy(true);
                      try {
                        c.onConfirm(c.inputValue, c.input2Value);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  className={confirm.danger ? btnDanger : btn}
                  disabled={busy}
                >
                  {confirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "list" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0f1c] p-4">
              <h2 className="mb-2 text-sm font-bold">
                Licences émises ({rows.length}
                {total > rows.length ? ` / ${total}` : ""})
              </h2>
              <input
                className={input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  loadList(e.target.value);
                }}
                placeholder="Rechercher (référence, ID)…"
                aria-label="Rechercher une licence"
              />
              <ul className="mt-2 max-h-[480px] space-y-1 overflow-y-auto">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/[0.05] ${selected === r.id ? "bg-amber-400/[0.13] font-bold text-amber-100" : "text-slate-300"}`}
                    >
                      <span className="font-mono">{r.license_id}</span> — {r.customer_ref} ·{" "}
                      {r.plan ?? r.edition} · {r.status}
                    </button>
                  </li>
                ))}
                {rows.length === 0 ? (
                  <li className="text-sm text-slate-500">
                    {query.trim() === "" ? "Aucune licence." : "Aucun résultat."}
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0f1c] p-4 text-sm">
              {!detail && !detailError ? (
                <p className="text-slate-500">Sélectionnez une licence.</p>
              ) : detailError && !detail ? (
                <p role="alert" className="text-red-300">
                  {detailError}
                </p>
              ) : detail ? (
                <div className="space-y-2">
                  <h2 className="font-mono text-base font-bold">{detail.license.license_id}</h2>
                  <p>Client : {detail.license.customer_ref}</p>
                  {detail.license.client_id ? <p>Réf : {detail.license.client_id}</p> : null}
                  {detail.license.client_name ? <p>Nom : {detail.license.client_name}</p> : null}
                  {detail.license.store_name ? <p>Magasin : {detail.license.store_name}</p> : null}
                  <p>
                    Plan : {detail.license.plan ?? "—"} · Édition : {detail.license.edition} · Type
                    : {detail.license.license_type}
                  </p>
                  <p>Statut : {detail.license.status}</p>
                  <p>Début : {detail.license.starts_at.slice(0, 10)}</p>
                  <p>
                    Fin :{" "}
                    {detail.license.expires_at ? detail.license.expires_at.slice(0, 10) : "à vie"}
                  </p>
                  <p>
                    Appareils :{" "}
                    {detail.license.device_binding === 0
                      ? "flottante"
                      : `liée${detail.license.max_devices ? ` (max ${detail.license.max_devices})` : ""}`}
                  </p>
                  <p className="break-all font-mono text-xs text-slate-400">
                    HW : {detail.license.hardware_fingerprint}
                  </p>
                  {detail.license.notes ? (
                    <p className="text-xs text-slate-400">Notes : {detail.license.notes}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    Fonctions :{" "}
                    {(JSON.parse(detail.license.features_json) as string[]).join(", ") || "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Pages :{" "}
                    {detail.license.pages_json
                      ? Object.entries(
                          JSON.parse(detail.license.pages_json) as Record<string, boolean>,
                        )
                          .filter(([, v]) => v)
                          .map(([k]) => k)
                          .join(", ") || "—"
                      : "—"}
                  </p>
                  {capsEdit ? (
                    <div className="space-y-2 rounded-lg border border-amber-400/30 p-3">
                      <h3 className={sectionTitle}>Modifier les accès</h3>
                      <div className="grid max-h-40 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto text-[13px]">
                        {PAGES.map((p) => (
                          <label key={p.id} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={capsEdit.pages.includes(p.id)}
                              onChange={() =>
                                setCapsEdit({
                                  ...capsEdit,
                                  pages: toggle(capsEdit.pages, p.id),
                                })
                              }
                            />
                            {p.fr}
                          </label>
                        ))}
                      </div>
                      <div className="grid max-h-40 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto text-[13px]">
                        {FEATURES.map((f) => (
                          <label key={f.id} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={capsEdit.features.includes(f.id)}
                              onChange={() =>
                                setCapsEdit({
                                  ...capsEdit,
                                  features: toggle(capsEdit.features, f.id),
                                })
                              }
                            />
                            {f.fr}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveCaps()}
                          className={btn}
                        >
                          Enregistrer (ré-émet)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setCapsEdit(null)}
                          className={btnGhost}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={busy || revoked}
                      title={revoked ? "Licence révoquée : export refusé" : undefined}
                      onClick={() => void runExport()}
                      className={btnGhost}
                    >
                      Exporter .vlic
                    </button>
                    <button
                      type="button"
                      disabled={busy || revoked}
                      onClick={() =>
                        askConfirm({
                          title: "Renouveler la licence",
                          message: "Durée en mois (vide = à vie).",
                          inputLabel: "Durée (mois)",
                          inputValue: "12",
                          inputPlaceholder: "12",
                          input2Value: "",
                          confirmLabel: "Renouveler",
                          onConfirm: (v) => void runRenew(v),
                        })
                      }
                      className={btnGhost}
                    >
                      Renouveler
                    </button>
                    <button
                      type="button"
                      disabled={busy || revoked}
                      onClick={() =>
                        askConfirm({
                          title: "Transférer la licence",
                          message:
                            "L'ancien poste deviendra invalide. Saisissez la nouvelle empreinte.",
                          inputLabel: "Nouvelle empreinte (64 hex)",
                          inputValue: "",
                          inputPlaceholder: "a1b2…",
                          input2Label: "Motif",
                          input2Value: "",
                          input2Placeholder: "Ex. : changement de PC",
                          confirmLabel: "Transférer",
                          onConfirm: (v1, v2) => void runTransfer(v1, v2),
                        })
                      }
                      className={btnGhost}
                    >
                      Transférer
                    </button>
                    <button
                      type="button"
                      disabled={busy || revoked || suspended}
                      onClick={() =>
                        askConfirm({
                          title: "Suspendre la licence ?",
                          message: "Le client devra réimporter le nouveau .vlic.",
                          danger: true,
                          inputValue: "",
                          input2Value: "",
                          confirmLabel: "Suspendre",
                          onConfirm: () => void runStanding("suspended"),
                        })
                      }
                      className={btnGhost}
                    >
                      Suspendre
                    </button>
                    <button
                      type="button"
                      disabled={busy || (!suspended && !revoked) || revoked}
                      onClick={() => void runStanding("active")}
                      className={btnGhost}
                    >
                      Réactiver
                    </button>
                    <button
                      type="button"
                      disabled={busy || revoked}
                      onClick={() => {
                        const lic = detail.license;
                        const feats = JSON.parse(lic.features_json) as string[];
                        const pgs = lic.pages_json
                          ? Object.entries(JSON.parse(lic.pages_json) as Record<string, boolean>)
                              .filter(([, v]) => v)
                              .map(([k]) => k)
                          : PAGES.map((p) => p.id);
                        setCapsEdit({ pages: pgs, features: feats });
                      }}
                      className={btnGhost}
                    >
                      Modifier les accès
                    </button>
                    <button
                      type="button"
                      disabled={busy || revoked}
                      onClick={() =>
                        askConfirm({
                          title: "Révoquer définitivement ?",
                          message:
                            "Export et renouvellement seront refusés. Cette action est irréversible.",
                          danger: true,
                          inputValue: "",
                          input2Value: "",
                          confirmLabel: "Révoquer",
                          onConfirm: () => void runRevoke(),
                        })
                      }
                      className={btnGhost}
                    >
                      Révoquer
                    </button>
                  </div>
                  <h3 className="pt-2 text-xs font-bold uppercase text-slate-500">Historique</h3>
                  <ul className="space-y-1 text-xs text-slate-400">
                    {(
                      detail.events as {
                        event: string;
                        created_at: string;
                        details_json?: unknown;
                      }[]
                    ).map((e, i) => (
                      <li key={i}>
                        {e.created_at.slice(0, 19).replace("T", " ")} — {eventSummary(e)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : tab === "backups" ? (
          <div className="space-y-3 rounded-xl border border-white/[0.06] bg-[#0a0f1c] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Sauvegardes du registre</h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => void backupNow()}
                className={btn}
              >
                Sauvegarder maintenant
              </button>
            </div>
            <ul className="space-y-1.5 text-sm">
              {backups.map((b) => (
                <li
                  key={b.file}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
                >
                  <span className="font-mono text-xs text-slate-300">
                    {b.file.split(/[/\\]/).pop()} · {Math.round(b.size / 1024)} Ko
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      askConfirm({
                        title: "Restaurer le registre ?",
                        message:
                          "Le registre actuel sera remplacé (snapshot de sécurité conservé).",
                        danger: true,
                        inputValue: "",
                        input2Value: "",
                        confirmLabel: "Restaurer",
                        onConfirm: () => void restoreNow(b.file),
                      })
                    }
                    className={btnGhost}
                  >
                    Restaurer
                  </button>
                </li>
              ))}
              {backups.length === 0 ? (
                <li className="text-sm text-slate-500">Aucune sauvegarde.</li>
              ) : null}
            </ul>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-white/[0.06] bg-[#0a0f1c] p-5">
            <h2 className="text-sm font-bold">Nouvelle licence</h2>

            <section className="space-y-3">
              <h3 className={sectionTitle}>Informations client</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>Nom du client</span>
                  <input
                    className={input}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex. : Ahmed Benali"
                  />
                </div>
                <div>
                  <span className={label}>Nom du magasin</span>
                  <input
                    className={input}
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ex. : Épicerie Ennour"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>Référence client *</span>
                  <input
                    className={input}
                    value={customerRef}
                    onChange={(e) => setCustomerRef(e.target.value)}
                    placeholder="Ex. : Épicerie Ennour — Alger"
                  />
                </div>
                <div>
                  <span className={label}>ID client</span>
                  <input
                    className={input}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Ex. : CLI-0042"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className={sectionTitle}>Licence</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className={label}>Plan (preset modifiable)</span>
                  <select
                    className={input}
                    value={plan}
                    onChange={(e) => applyPlan(e.target.value)}
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Édition émise : {derivedEdition}</p>
                </div>
                <div>
                  <span className={label}>Durée</span>
                  <select
                    className={input}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.months} value={String(d.months)}>
                        {d.label}
                      </option>
                    ))}
                    <option value="lifetime">À vie</option>
                    <option value="custom">Personnalisée</option>
                  </select>
                </div>
                <div>
                  <span className={label}>Appareils max</span>
                  <input
                    className={input}
                    value={maxDevices}
                    onChange={(e) => setMaxDevices(e.target.value)}
                    placeholder="1"
                    inputMode="numeric"
                  />
                </div>
              </div>
              {duration === "custom" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={label}>Début (AAAA-MM-JJ)</span>
                    <input
                      type="date"
                      className={input}
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <span className={label}>Fin (AAAA-MM-JJ)</span>
                    <input
                      type="date"
                      className={input}
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              <div>
                <span className={label}>Empreinte matérielle client (64 hex) *</span>
                <input
                  className={input + " font-mono"}
                  value={fingerprint}
                  onChange={(e) => setFingerprint(e.target.value)}
                  placeholder="a1b2…"
                  aria-label="Empreinte matérielle"
                />
                {fingerprint.trim() !== "" ? (
                  <p className={`mt-1 text-xs ${fpValid ? "text-emerald-300" : "text-red-300"}`}>
                    {fpValid ? "Empreinte valide." : "64 caractères hexadécimaux attendus."}
                  </p>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={deviceBinding}
                  onChange={(e) => setDeviceBinding(e.target.checked)}
                />
                Lier à l&apos;appareil (désactivé = licence flottante)
              </label>
            </section>

            <section className="space-y-2">
              <h3 className={sectionTitle}>
                Page access ({pages.length}/{PAGES.length})
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm md:grid-cols-3">
                {PAGES.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={pages.includes(p.id)}
                      onChange={() => setPages((prev) => toggle(prev, p.id))}
                    />
                    {p.fr}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className={sectionTitle}>
                Feature access ({features.length}/{FEATURES.length})
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm md:grid-cols-3">
                {FEATURES.map((f) => (
                  <label key={f.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={features.includes(f.id)}
                      onChange={() => setFeatures((prev) => toggle(prev, f.id))}
                    />
                    {f.fr}
                  </label>
                ))}
              </div>
            </section>

            <div>
              <span className={label}>Notes internes</span>
              <input
                className={input}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
            <button type="button" disabled={busy} onClick={() => void create()} className={btn}>
              Générer la licence
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
