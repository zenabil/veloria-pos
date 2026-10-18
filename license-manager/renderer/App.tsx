// Veloria License Manager — UI éditeur (FR). Création, renouvellement,
// transfert, suspension, révocation, droits d'accès, export .vlic, sauvegardes.
// Aucune clé affichée. Confirmations inline (jamais window.prompt/confirm).
import { useCallback, useEffect, useState } from "react";
import { mapi } from "./ipc-client.ts";
import { frError } from "../../src/shared/errors/fr-map.ts";

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

const PLAN_FR: Record<string, string> = {
  BASIC: "Essentielle",
  STANDARD: "Standard",
  PRO: "Pro",
  ENTERPRISE: "Entreprise",
  CUSTOM: "Sur mesure",
};

const EDITION_FR: Record<string, string> = {
  basic: "Essentielle",
  standard: "Standard",
  professional: "Professionnelle",
  pro: "Pro",
  enterprise: "Entreprise",
  custom: "Sur mesure",
};

const STATUS_FR: Record<string, string> = {
  active: "Active",
  suspended: "Suspendue",
  revoked: "Révoquée",
  expired: "Expirée",
};

const TYPE_FR: Record<string, string> = {
  term: "Temporaire",
  lifetime: "À vie",
};

/** D10 : langage d'état par pastille + compte à rebours (jamais de
 *  border-left coloré). J-X affiché pour les temporaires expirant sous
 *  30 j ; dates ISO comparées en UTC (pas de piège fuseau). */
const STATUS_DOT: Record<string, string> = {
  active: "bg-[#4edea3]",
  suspended: "bg-[#fbbf24]",
  revoked: "bg-[#ffb4ab]",
  expired: "bg-[#ffb4ab]",
};

function daysToExpiry(expiresAt: string | null): number | null {
  if (typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(expiresAt)) return null;
  const parts = expiresAt.slice(0, 10).split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((Date.UTC(y as number, (m as number) - 1, d as number) - todayUtc) / 86_400_000);
}

const EVENT_FR: Record<string, string> = {
  created: "Créée",
  renewed: "Renouvelée",
  transferred: "Transférée",
  suspended: "Suspendue",
  reactivated: "Réactivée",
  revoked: "Révoquée",
  capabilities_updated: "Accès modifiés",
  exported: "Exportée",
  restored: "Restaurée",
  standing_suspended: "Suspendue",
  standing_active: "Réactivée",
};

const DETAIL_KEY_FR: Record<string, string> = {
  newFingerprint: "nouvelle empreinte",
  durationMonths: "durée",
  licenseType: "type",
  reason: "motif",
  status: "statut",
  features: "fonctions",
  pages: "pages",
  maxDevices: "appareils max",
};

const EDITION_FROM_PLAN: Record<string, string> = {
  BASIC: "basic",
  STANDARD: "standard",
  PRO: "pro",
  ENTERPRISE: "enterprise",
  CUSTOM: "custom",
};

export const PAGES: { id: string; fr: string }[] = [
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
  { id: "pain", fr: "Gestion du pain" },
  { id: "breadOrders", fr: "Commandes de pain" },
  { id: "proformas", fr: "Proformas" },
  { id: "invoices", fr: "Factures" },
  { id: "zakat", fr: "Zakat" },
  { id: "settings", fr: "Paramètres" },
];

export const FEATURES: { id: string; fr: string }[] = [
  { id: "receipt-80mm", fr: "Ticket 80mm" },
  { id: "invoice-a4", fr: "Facture A4" },
  { id: "automatic-backup", fr: "Sauvegarde auto" },
  { id: "restore-backup", fr: "Restauration" },
  { id: "barcode-scanner", fr: "Codes-barres" },
  { id: "ocr", fr: "Reconnaissance (OCR)" },
  { id: "excel-export", fr: "Export Excel" },
  { id: "pdf-export", fr: "Export PDF" },
  { id: "debt-management", fr: "Dettes" },
  { id: "partial-payments", fr: "Paiements partiels" },
  { id: "returns", fr: "Retours" },
  { id: "proformas", fr: "Proformas" },
  { id: "advanced-reports", fr: "Rapports avancés" },
  { id: "multi-printer", fr: "Multi-imprimante" },
];

/** Préréglages locaux (miroir des préréglages main — l'émission signe le choix final). */
export const PRESETS: Record<string, { pages: string[]; features: string[] }> = {
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
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/60";
const btn =
  "rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200";
const btnDanger =
  "rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300";
const btnGhost =
  "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60";
const label = "mb-1 block text-xs font-semibold text-slate-400";
const sectionTitle = "text-xs font-extrabold uppercase tracking-wider text-amber-300/90";

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Lecture JSON tolérante : ligne corrompue = repli, jamais d'écran blanc. */
function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function eventSummary(e: { event: string; details_json?: unknown }): string {
  const eventFr = EVENT_FR[e.event] ?? e.event;
  if (typeof e.details_json !== "string") return eventFr;
  try {
    const d = JSON.parse(e.details_json) as Record<string, unknown>;
    const parts = Object.entries(d)
      .slice(0, 3)
      .map(([k, v]) => `${DETAIL_KEY_FR[k] ?? k}=${String(v).slice(0, 24)}`);
    return parts.length > 0 ? `${eventFr} (${parts.join(", ")})` : eventFr;
  } catch {
    return eventFr;
  }
}

function planFr(plan: string | null, edition: string): string {
  if (plan && PLAN_FR[plan]) return PLAN_FR[plan] as string;
  return EDITION_FR[edition] ?? edition;
}

function featuresFr(ids: string[]): string {
  if (ids.length === 0) return "—";
  return ids.map((id) => FEATURES.find((f) => f.id === id)?.fr ?? id).join(", ");
}

function pagesFr(ids: string[]): string {
  if (ids.length === 0) return "—";
  return ids.map((id) => PAGES.find((p) => p.id === id)?.fr ?? id).join(", ");
}

export function ManagerApp(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("list");
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
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
        setListError(null);
      })
      .catch((e: unknown) => {
        console.error("[manager]", e);
        setListError("Liste des licences indisponible.");
      });
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

  // P3 : sauvegarde du registre éditeur (aucun secret dedans : clé hors base).
  async function backupNow(): Promise<void> {
    setBusy(true);
    try {
      const r = (await mapi.backup()) as { file: string; size: number };
      say(`Registre sauvegardé (${Math.round(r.size / 1024)}\u00A0Ko).`);
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
      setSelected(null);
      say("Registre restauré.");
      refresh();
      loadBackups();
    } catch (e) {
      console.error("[manager]", e);
      say(frError(e, "Restauration impossible."));
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
        console.error("[manager]", e);
        setDetailError(frError(e, "Détail indisponible."));
      });
  }, [selected]);

  function reloadDetail(): void {
    if (selected == null) return;
    mapi
      .licenseDetail({ id: selected })
      .then((d) => {
        setDetail(d as { license: LicenseRow; events: unknown[] });
        setDetailError(null);
        setCapsEdit(null);
      })
      .catch((e: unknown) => {
        console.error("[manager]", e);
        setDetailError(frError(e, "Détail indisponible."));
      });
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
            "Une clé vendor existe déjà. La remplacer invalide toute re-signature future avec l'ancienne clé. Les nouvelles licences ne seront vérifiées sur le parc POS qu'après diffusion de la nouvelle clé publique (public.key). Continuer ?",
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
        say(r.encrypted ? "Clé privée importée (chiffrée)." : "Clé privée importée.");
      } else if (!r.imported) {
        say("Import annulé.");
      } else {
        say("Clé importée mais illisible : vérifiez le fichier.");
      }
      refresh();
    } catch (e) {
      console.error("[manager]", e);
      say(frError(e, "Import impossible."));
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
          say(
            "Appareils max invalide : saisissez un nombre entier entre 1 et 99 (laissez vide pour 1 poste).",
          );
          return;
        }
        maxDevicesValue = n;
      }
      const fp = fingerprint.trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(fp)) {
        say("Empreinte invalide : 64 caractères hexadécimaux (0-9, a-f) attendus.");
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
      say(`Licence ${r.licenseId} créée. Exportez le fichier .vlic.`);
      setTab("list");
      refresh();
    } catch (e) {
      console.error("[manager]", e);
      say(frError(e, "Création impossible."));
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
      console.error("[manager]", e);
      say(frError(e, "Opération impossible."));
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
      console.error("[manager]", e);
      say(frError(e, "Opération impossible."));
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
      console.error("[manager]", e);
      say(frError(e, "Opération impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function runTransfer(fpRaw: string, reasonRaw: string): Promise<void> {
    if (selected == null) return;
    const clean = fpRaw.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(clean)) {
      say("Empreinte invalide : 64 caractères hexadécimaux (0-9, a-f) attendus.");
      return;
    }
    setBusy(true);
    try {
      await mapi.licenseTransfer({
        id: selected,
        newFingerprint: clean,
        reason: reasonRaw.trim() === "" ? "Transfert de poste" : reasonRaw.trim().slice(0, 500),
      });
      say("Licence transférée (ancien poste invalidé).");
      refresh();
      reloadDetail();
    } catch (e) {
      console.error("[manager]", e);
      say(frError(e, "Opération impossible."));
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
      say(r.exported ? `Licence exportée : ${r.path}` : "Export annulé.");
    } catch (e) {
      console.error("[manager]", e);
      say(frError(e, "Opération impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function saveCaps(): Promise<void> {
    if (selected == null || capsEdit == null) return;
    if (capsEdit.features.length === 0) {
      say("Sélectionnez au moins une fonction.");
      return;
    }
    setBusy(true);
    try {
      await mapi.licenseCapabilities({
        id: selected,
        features: capsEdit.features,
        pages: Object.fromEntries(PAGES.map((p) => [p.id, capsEdit.pages.includes(p.id)])),
      });
      say("Accès enregistrés. Exportez le nouveau fichier .vlic.");
      refresh();
      reloadDetail();
    } catch (e) {
      console.error("[manager]", e);
      say(frError(e, "Opération impossible."));
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
    <div className="min-h-screen bg-[var(--fond-nuit)] p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              Veloria — Gestionnaire de licences
            </h1>
            <p className="text-xs text-slate-500">
              Outil éditeur — création et gestion des licences hors-ligne.
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
          </div>
        </header>

        {keyOk === false ? (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-[var(--fond-alerte)] px-4 py-3 text-sm text-red-100"
          >
            <p className="font-bold">Clé privée éditeur absente.</p>
            <p className="mt-1 text-red-200/80">
              Importez-la une seule fois : elle sera copiée chiffrée dans le dossier de clés du
              gestionnaire (jamais affichée, jamais exportée).
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void importKey()}
              className={btnDanger}
            >
              Importer la clé privée…
            </button>
          </div>
        ) : null}
        {toast ? (
          <div
            role="status"
            className="rounded-xl border border-amber-400/30 bg-[var(--fond-avertissement)] px-4 py-2.5 text-sm text-amber-100"
          >
            {toast}
          </div>
        ) : null}

        {confirm ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={confirm.title}
            aria-describedby="manager-confirm-message"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          >
            <div className="w-full max-w-md space-y-3 rounded-xl border border-white/10 bg-[var(--fond-carte)] p-5">
              <h2 className="text-base font-bold">{confirm.title}</h2>
              <p id="manager-confirm-message" className="text-sm text-slate-300">
                {confirm.message}
              </p>
              {confirm.inputLabel ? (
                <div>
                  <label htmlFor="manager-confirm-entree" className={label}>
                    {confirm.inputLabel}
                  </label>
                  <input
                    id="manager-confirm-entree"
                    className={input + " font-mono"}
                    value={confirm.inputValue}
                    onChange={(e) => setConfirm({ ...confirm, inputValue: e.target.value })}
                    placeholder={confirm.inputPlaceholder ?? ""}
                  />
                </div>
              ) : null}
              {confirm.input2Label ? (
                <div>
                  <label htmlFor="manager-confirm-entree-2" className={label}>
                    {confirm.input2Label}
                  </label>
                  <input
                    id="manager-confirm-entree-2"
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
                        await c.onConfirm(c.inputValue, c.input2Value);
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
            <div className="rounded-xl border border-white/[0.06] bg-[var(--fond-carte)] p-4">
              <h2 className="mb-2 text-sm font-bold">
                Licences émises ({rows.length}
                {total > rows.length ? ` / ${total}` : ""})
              </h2>
              <label htmlFor="recherche-licence" className="sr-only">
                Rechercher une licence
              </label>
              <input
                className={input}
                id="recherche-licence"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                placeholder="Rechercher (référence, identifiant, magasin)…"
                aria-label="Rechercher une licence (référence, identifiant, magasin)"
              />
              <ul className="mt-2 max-h-[480px] space-y-1 overflow-y-auto">
                {listError ? (
                  <li role="alert" className="text-sm text-red-300">
                    {listError}
                  </li>
                ) : null}
                {rows.map((r) => {
                  const left = r.license_type === "term" ? daysToExpiry(r.expires_at) : null;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/[0.05] ${selected === r.id ? "bg-amber-400/[0.13] font-bold text-amber-100" : "text-slate-300"}`}
                      >
                        <span
                          aria-hidden="true"
                          title={STATUS_FR[r.status] ?? r.status}
                          className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STATUS_DOT[r.status] ?? "bg-slate-500"}`}
                        />
                        <span className="font-mono">{r.license_id}</span> — {r.customer_ref} ·{" "}
                        {planFr(r.plan, r.edition)} · {STATUS_FR[r.status] ?? r.status}
                        {left != null && left > 0 && left <= 30 ? (
                          <span
                            title={`Expire dans ${left} jour(s)`}
                            className="ml-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200"
                          >
                            J-{left}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {!listError && rows.length === 0 ? (
                  <li className="text-sm text-slate-500">
                    {query.trim() === "" ? "Aucune licence." : "Aucun résultat."}
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[var(--fond-carte)] p-4 text-sm">
              {!detail && !detailError ? (
                <p className="text-slate-500">Sélectionnez une licence.</p>
              ) : detailError && !detail ? (
                <p role="alert" className="text-red-300">
                  {detailError}
                </p>
              ) : detail ? (
                <div className="space-y-2">
                  <h2 className="font-mono text-base font-bold">{detail.license.license_id}</h2>
                  <p>Référence : {detail.license.customer_ref}</p>
                  {detail.license.client_id ? (
                    <p>Identifiant : {detail.license.client_id}</p>
                  ) : null}
                  {detail.license.client_name ? <p>Client : {detail.license.client_name}</p> : null}
                  {detail.license.store_name ? <p>Magasin : {detail.license.store_name}</p> : null}
                  <p>
                    Offre : {planFr(detail.license.plan, detail.license.edition)} · Édition :{" "}
                    {EDITION_FR[detail.license.edition] ?? detail.license.edition} · Durée :{" "}
                    {TYPE_FR[detail.license.license_type] ?? detail.license.license_type}
                  </p>
                  <p>Statut : {STATUS_FR[detail.license.status] ?? detail.license.status}</p>
                  <p>Début : {detail.license.starts_at.slice(0, 10)}</p>
                  <p>
                    Fin :{" "}
                    {detail.license.expires_at ? detail.license.expires_at.slice(0, 10) : "à vie"}
                  </p>
                  <p>
                    Appareils :{" "}
                    {detail.license.device_binding === 0
                      ? "Licence flottante"
                      : `Licence liée${detail.license.max_devices ? ` (max ${detail.license.max_devices})` : ""}`}
                  </p>
                  <p className="break-all font-mono text-xs text-slate-400">
                    Empreinte : {detail.license.hardware_fingerprint}
                  </p>
                  {detail.license.notes ? (
                    <p className="text-xs text-slate-400">
                      Notes internes : {detail.license.notes}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    Fonctions :{" "}
                    {featuresFr(parseJsonSafe<string[]>(detail.license.features_json, []))}
                  </p>
                  <p className="text-xs text-slate-400">
                    Pages :{" "}
                    {detail.license.pages_json
                      ? pagesFr(
                          Object.entries(
                            parseJsonSafe<Record<string, boolean>>(detail.license.pages_json, {}),
                          )
                            .filter(([, v]) => v)
                            .map(([k]) => k),
                        )
                      : "—"}
                  </p>
                  {capsEdit ? (
                    <div className="space-y-2 rounded-lg border border-amber-400/30 p-3">
                      <h3 className={sectionTitle}>Nouveaux accès (non enregistrés)</h3>
                      <h4 className="text-xs font-bold text-slate-400">Pages</h4>
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
                      <h4 className="text-xs font-bold text-slate-400">Fonctions</h4>
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
                          Enregistrer les accès
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setCapsEdit(null)}
                          className={btnGhost}
                        >
                          Abandonner
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
                      Exporter le fichier .vlic
                    </button>
                    <button
                      type="button"
                      disabled={busy || revoked}
                      onClick={() =>
                        askConfirm({
                          title: "Renouveler la licence",
                          message: "Laissez vide pour une licence à vie.",
                          inputLabel: "Durée (mois)",
                          inputValue: "12",
                          inputPlaceholder: "Ex. : 12 (vide = à vie)",
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
                          inputLabel: "Nouvelle empreinte matérielle (64 caractères hexadécimaux)",
                          inputValue: "",
                          inputPlaceholder: "64 caractères hexadécimaux (ex. : a1b2…f9)",
                          input2Label: "Motif du transfert",
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
                          message: "Le client devra réimporter le nouveau fichier .vlic.",
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
                        const feats = parseJsonSafe<string[]>(lic.features_json, []);
                        const pgs = lic.pages_json
                          ? Object.entries(
                              parseJsonSafe<Record<string, boolean>>(lic.pages_json, {}),
                            )
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
                  <h3 className={sectionTitle}>Historique de la licence</h3>
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
          <div className="space-y-3 rounded-xl border border-white/[0.06] bg-[var(--fond-carte)] p-5">
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
                    {b.file.split(/[/\\]/).pop()} · {Math.round(b.size / 1024)}\u00A0Ko
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      askConfirm({
                        title: "Restaurer le registre ?",
                        message: "Le registre actuel sera remplacé (copie de sécurité conservée).",
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
          <div className="space-y-4 rounded-xl border border-white/[0.06] bg-[var(--fond-carte)] p-5">
            <h2 className="text-sm font-bold">Nouvelle licence</h2>
            <p className="text-xs text-slate-500">* Champs obligatoires</p>

            <section className="space-y-3">
              <h3 className={sectionTitle}>Informations client</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="licence-client-nom" className={label}>
                    Nom du client
                  </label>
                  <input
                    className={input}
                    id="licence-client-nom"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex. : Ahmed Benali"
                  />
                </div>
                <div>
                  <label htmlFor="licence-magasin-nom" className={label}>
                    Nom du magasin
                  </label>
                  <input
                    className={input}
                    id="licence-magasin-nom"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ex. : Épicerie Ennour — Alger"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="licence-reference-client" className={label}>
                    Référence client *
                  </label>
                  <input
                    className={input}
                    id="licence-reference-client"
                    value={customerRef}
                    required
                    aria-required="true"
                    onChange={(e) => setCustomerRef(e.target.value)}
                    placeholder="Ex. : CLI-ENNOUR-001"
                  />
                </div>
                <div>
                  <label htmlFor="licence-identifiant-client" className={label}>
                    Identifiant client
                  </label>
                  <input
                    className={input}
                    id="licence-identifiant-client"
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
                  <label htmlFor="licence-offre" className={label}>
                    Offre (préréglage modifiable)
                  </label>
                  <select
                    className={input}
                    id="licence-offre"
                    value={plan}
                    onChange={(e) => applyPlan(e.target.value)}
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {PLAN_FR[p] ?? p}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Édition émise : {EDITION_FR[derivedEdition] ?? derivedEdition}
                  </p>
                </div>
                <div>
                  <label htmlFor="licence-duree" className={label}>
                    Durée
                  </label>
                  <select
                    className={input}
                    id="licence-duree"
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
                  <label htmlFor="licence-appareils-max" className={label}>
                    Appareils max
                  </label>
                  <input
                    className={input}
                    id="licence-appareils-max"
                    value={maxDevices}
                    onChange={(e) => setMaxDevices(e.target.value)}
                    placeholder="Ex. : 1 (vide = 1 poste)"
                    inputMode="numeric"
                  />
                </div>
              </div>
              {duration === "custom" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="licence-debut" className={label}>
                      Début
                    </label>
                    <input
                      type="date"
                      className={input}
                      id="licence-debut"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="licence-fin" className={label}>
                      Fin
                    </label>
                    <input
                      type="date"
                      className={input}
                      id="licence-fin"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              <div>
                <label htmlFor="licence-empreinte" className={label}>
                  Empreinte matérielle (64 caractères hexadécimaux) *
                </label>
                <input
                  className={input + " font-mono"}
                  id="licence-empreinte"
                  value={fingerprint}
                  required
                  aria-required="true"
                  onChange={(e) => setFingerprint(e.target.value)}
                  placeholder="64 caractères hexadécimaux (ex. : a1b2…f9)"
                  aria-label="Empreinte matérielle (64 caractères hexadécimaux)"
                />
                {fingerprint.trim() !== "" ? (
                  <p className={`mt-1 text-xs ${fpValid ? "text-emerald-300" : "text-red-300"}`}>
                    {fpValid
                      ? "Empreinte valide."
                      : "Empreinte invalide : 64 caractères hexadécimaux (0-9, a-f) attendus."}
                  </p>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={deviceBinding}
                  onChange={(e) => setDeviceBinding(e.target.checked)}
                />
                Lier à cet appareil (décoché = licence flottante)
              </label>
            </section>

            <section className="space-y-2">
              <h3 className={sectionTitle}>
                Pages autorisées ({pages.length}/{PAGES.length})
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
                Fonctions autorisées ({features.length}/{FEATURES.length})
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
              <label htmlFor="licence-notes" className={label}>
                Notes internes (non exportées)
              </label>
              <input
                className={input}
                id="licence-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Facultatif — ex. : client préférentiel"
              />
            </div>
            <button type="button" disabled={busy} onClick={() => void create()} className={btn}>
              Créer la licence
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
