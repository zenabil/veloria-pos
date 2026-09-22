// Veloria License Manager — UI vendor (FR). Création, renouvellement,
// transfert, suspension, révocation, capabilities, export .vlic.
// Presets de plans modifiables avant émission (§20). Aucune clé affichée.
import { useCallback, useEffect, useState } from "react";
import { mapi } from "./ipc-client.ts";

type Tab = "list" | "new";

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
  created_at: string;
}

const PLANS = ["BASIC", "STANDARD", "PRO", "ENTERPRISE", "CUSTOM"] as const;

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
const btnGhost =
  "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50";
const label = "mb-1 block text-xs font-semibold text-slate-400";
const sectionTitle = "text-xs font-extrabold uppercase tracking-wider text-amber-300/90";

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function ManagerApp(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("list");
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ license: LicenseRow; events: unknown[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  // P3 : sauvegarde du registre vendor (aucun secret dedans : clé hors base).
  async function backupNow(): Promise<void> {
    setBusy(true);
    try {
      const r = (await mapi.backup()) as { file: string; size: number };
      say(`Registre sauvegardé (${Math.round(r.size / 1024)} Ko).`);
    } catch {
      say("Sauvegarde impossible.");
    } finally {
      setBusy(false);
    }
  }

  const refresh = useCallback(() => {
    mapi
      .keyStatus()
      .then((k) => setKeyOk((k as { configured: boolean }).configured))
      .catch(() => setKeyOk(false));
    mapi
      .licensesList()
      .then((l) => setRows(((l as { rows: LicenseRow[] }).rows ?? []) as LicenseRow[]))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (selected == null) {
      setDetail(null);
      return;
    }
    mapi
      .licenseDetail({ id: selected })
      .then((d) => setDetail(d as { license: LicenseRow; events: unknown[] }))
      .catch(() => undefined);
  }, [selected]);

  function applyPlan(p: string): void {
    setPlan(p);
    const preset = PRESETS[p] ?? PRESETS["CUSTOM"];
    if (preset) {
      setPages([...preset.pages]);
      setFeatures([...preset.features]);
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
      const payload: Record<string, unknown> = {
        customerRef: customerRef.trim(),
        clientId: clientId.trim() === "" ? null : clientId.trim(),
        clientName: clientName.trim() === "" ? null : clientName.trim(),
        storeName: storeName.trim() === "" ? null : storeName.trim(),
        edition: "pro",
        plan,
        licenseType: isLifetime ? "lifetime" : "term",
        licenseStatus: "active",
        deviceBinding,
        maxDevices: maxDevicesValue,
        hardwareFingerprint: fingerprint.trim().toLowerCase(),
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

  async function act(
    kind: "export" | "renew" | "transfer" | "revoke" | "suspend" | "unsuspend" | "capabilities",
  ): Promise<void> {
    if (selected == null) return;
    setBusy(true);
    try {
      if (kind === "export") {
        const r = (await mapi.licenseExport({ id: selected })) as {
          exported: boolean;
          path: string | null;
        };
        say(r.exported ? `Exportée : ${r.path}` : "Export annulé.");
      } else if (kind === "renew") {
        const months = window.prompt("Renouveler : durée en mois (vide = à vie) ?", "12");
        if (months === null) return;
        if (months.trim() === "") {
          await mapi.licenseRenew({ id: selected, licenseType: "lifetime" });
        } else {
          const n = Number(months.trim());
          if (!Number.isInteger(n) || n < 1 || n > 120) {
            say("Durée invalide : saisissez un nombre entier de mois entre 1 et 120.");
            return;
          }
          await mapi.licenseRenew({ id: selected, licenseType: "term", durationMonths: n });
        }
        say("Licence renouvelée.");
      } else if (kind === "transfer") {
        const fp = window.prompt("Nouvelle empreinte matérielle (64 hex) ?", "");
        if (!fp) return;
        const clean = fp.trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(clean)) {
          say("Empreinte invalide : 64 caractères hexadécimaux attendus.");
          return;
        }
        await mapi.licenseTransfer({
          id: selected,
          newFingerprint: clean,
          reason: "transfert poste",
        });
        say("Licence transférée (ancien poste invalidé).");
      } else if (kind === "revoke") {
        if (!window.confirm("Révoquer cette licence ? (export et renouvellement refusés)")) return;
        await mapi.licenseRevoke({ id: selected });
        say("Licence révoquée.");
      } else if (kind === "suspend") {
        if (!window.confirm("Suspendre cette licence ? (réimport .vlic requis côté client)"))
          return;
        await mapi.licenseStanding({ id: selected, status: "suspended" });
        say("Licence suspendue.");
      } else if (kind === "unsuspend") {
        await mapi.licenseStanding({ id: selected, status: "active" });
        say("Licence réactivée.");
      } else {
        // Ré-émission des capabilities affichées dans le détail.
        const lic = detail?.license;
        if (!lic) return;
        const currentFeatures = JSON.parse(lic.features_json) as string[];
        const currentPages = lic.pages_json
          ? (JSON.parse(lic.pages_json) as Record<string, boolean>)
          : null;
        await mapi.licenseCapabilities({
          id: selected,
          features: currentFeatures,
          pages: currentPages,
        });
        say("Capabilities ré-émises (exportez le nouveau .vlic).");
      }
      refresh();
      const d = (await mapi.licenseDetail({ id: selected })) as {
        license: LicenseRow;
        events: unknown[];
      };
      setDetail(d);
    } catch (e) {
      say(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

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
            Clé privée vendor introuvable : placez-la dans le dossier keys (voir KEY_MANAGEMENT).
            Aucune création/export possible sans elle.
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

        {tab === "list" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0f1c] p-4">
              <h2 className="mb-2 text-sm font-bold">Licences émises ({rows.length})</h2>
              <ul className="max-h-[520px] space-y-1 overflow-y-auto">
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
                  <li className="text-sm text-slate-500">Aucune licence.</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0f1c] p-4 text-sm">
              {!detail ? (
                <p className="text-slate-500">Sélectionnez une licence.</p>
              ) : (
                <div className="space-y-2">
                  <h2 className="font-mono text-base font-bold">{detail.license.license_id}</h2>
                  <p>Client : {detail.license.customer_ref}</p>
                  {detail.license.client_name ? <p>Nom : {detail.license.client_name}</p> : null}
                  {detail.license.store_name ? <p>Magasin : {detail.license.store_name}</p> : null}
                  <p>
                    Plan : {detail.license.plan ?? "—"} · Type : {detail.license.license_type}
                  </p>
                  <p>Statut : {detail.license.status}</p>
                  <p>Début : {detail.license.starts_at.slice(0, 10)}</p>
                  <p>
                    Fin :{" "}
                    {detail.license.expires_at ? detail.license.expires_at.slice(0, 10) : "à vie"}
                  </p>
                  <p className="break-all font-mono text-xs text-slate-400">
                    HW : {detail.license.hardware_fingerprint}
                  </p>
                  <p className="text-xs text-slate-400">
                    Fonctions :{" "}
                    {(JSON.parse(detail.license.features_json) as string[]).join(", ") || "—"}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("export")}
                      className={btnGhost}
                    >
                      Exporter .vlic
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("renew")}
                      className={btnGhost}
                    >
                      Renouveler
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("transfer")}
                      className={btnGhost}
                    >
                      Transférer
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("suspend")}
                      className={btnGhost}
                    >
                      Suspendre
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("unsuspend")}
                      className={btnGhost}
                    >
                      Réactiver
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("capabilities")}
                      className={btnGhost}
                    >
                      Ré-émettre
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("revoke")}
                      className={btnGhost}
                    >
                      Révoquer
                    </button>
                  </div>
                  <h3 className="pt-2 text-xs font-bold uppercase text-slate-500">Historique</h3>
                  <ul className="space-y-1 text-xs text-slate-400">
                    {(detail.events as { event: string; created_at: string }[]).map((e, i) => (
                      <li key={i}>
                        {e.created_at.slice(0, 19).replace("T", " ")} — {e.event}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
                />
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
