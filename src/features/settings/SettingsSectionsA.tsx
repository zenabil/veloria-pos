// Veloria PoS — Paramètres : sections Général → Fournisseurs.
import { useEffect, useRef, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { minorToInput } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { assertValidAnnouncement } from "@domain/customer/client-access.ts";
import { Field, Select, TextArea, TextInput } from "@shared/ui/primitives.tsx";
import { saveAppSettings, useAppSettings } from "@shared/settings/use-app-settings.ts";
import { SaveBar, Section, SwitchRow, useBusyFlag } from "./bits.tsx";
import {
  clampVolume,
  getSoundVolume,
  isSoundEnabled,
  persistSoundEnabled,
  playSound,
  setSoundEnabled,
  setSoundVolume,
} from "@shared/sound/sound.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

interface Company {
  company_name: string | null;
  commercial_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  nif: string | null;
  rc_number: string | null;
  nis: string | null;
  article_imposition: string | null;
  invoice_prefix: string | null;
  logo_path: string | null;
}

// ---------------------------------------------------------------------------
// Entreprise : fiche société (imprimés + préfixe factures).
// ---------------------------------------------------------------------------

export function CompanySection({ notify }: { notify: Notify }): React.JSX.Element {
  const [form, setForm] = useState({
    name: "",
    commercial: "",
    address: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    nif: "",
    rc: "",
    nis: "",
    article: "",
    prefix: "",
    logo: "",
  });
  /** Aperçu du logo (data URL fournie par le main, jamais de lecture fichier renderer). */
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    api
      .companyGet()
      .then((c) => {
        const res = c as { company: Company | null; logoDataUrl?: string | null };
        const co = res.company;
        if (!co) return;
        setForm({
          name: co.company_name ?? "",
          commercial: co.commercial_name ?? "",
          address: co.address ?? "",
          city: co.city ?? "",
          phone: co.phone ?? "",
          email: co.email ?? "",
          website: co.website ?? "",
          nif: co.nif ?? "",
          rc: co.rc_number ?? "",
          nis: co.nis ?? "",
          article: co.article_imposition ?? "",
          prefix: co.invoice_prefix ?? "",
          logo: co.logo_path ?? "",
        });
        setLogoPreview(typeof res.logoDataUrl === "string" ? res.logoDataUrl : null);
      })
      .catch(() => undefined);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /** Sélecteur de fichier (main) : copie vérifiée + aperçu immédiat. */
  function chooseLogo(): void {
    void run(async () => {
      try {
        const r = (await api.systemSelectLogo()) as {
          path: string | null;
          dataUrl: string | null;
        };
        if (r.path == null) return; // annulation : silencieux
        setForm((f) => ({ ...f, logo: r.path ?? "" }));
        setLogoPreview(r.dataUrl);
        notify("Logo sélectionné. Enregistrez la fiche pour l'appliquer.", "ok");
      } catch (e) {
        notify(frError(e, "Sélection du logo impossible."), "err");
      }
    });
  }

  function removeLogo(): void {
    setForm((f) => ({ ...f, logo: "" }));
    setLogoPreview(null);
  }

  function save(): void {
    if (form.name.trim().length < 1) {
      notify("Nom de l'entreprise requis.", "err");
      return;
    }
    void run(async () => {
      try {
        await api.companyUpdate({
          company_name: form.name.trim(),
          commercial_name: form.commercial.trim() === "" ? null : form.commercial.trim(),
          phone: form.phone.trim() === "" ? null : form.phone.trim(),
          email: form.email.trim() === "" ? null : form.email.trim(),
          website: form.website.trim() === "" ? null : form.website.trim(),
          address: form.address.trim() === "" ? null : form.address.trim(),
          city: form.city.trim() === "" ? null : form.city.trim(),
          tax_number: form.nif.trim() === "" ? null : form.nif.trim(),
          commercial_register: form.rc.trim() === "" ? null : form.rc.trim(),
          nis: form.nis.trim() === "" ? null : form.nis.trim(),
          article_imposition: form.article.trim() === "" ? null : form.article.trim(),
          invoice_prefix: form.prefix.trim() === "" ? null : form.prefix.trim(),
          logo_path: form.logo.trim() === "" ? null : form.logo.trim(),
        });
        notify("Fiche entreprise enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Entreprise" hint="Reprise sur les factures, tickets et rapports.">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom (raison sociale) *">
          <TextInput value={form.name} onChange={set("name")} aria-label="Nom entreprise" />
        </Field>
        <Field label="Nom commercial">
          <TextInput
            value={form.commercial}
            onChange={set("commercial")}
            aria-label="Nom commercial"
          />
        </Field>
      </div>
      <Field label="Adresse">
        <TextInput value={form.address} onChange={set("address")} aria-label="Adresse" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Wilaya">
          <TextInput value={form.city} onChange={set("city")} aria-label="Wilaya" />
        </Field>
        <Field label="Téléphone">
          <TextInput
            value={form.phone}
            onChange={set("phone")}
            inputMode="tel"
            aria-label="Téléphone"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="E-mail">
          <TextInput
            value={form.email}
            onChange={set("email")}
            inputMode="email"
            aria-label="E-mail"
          />
        </Field>
        <Field label="Site web">
          <TextInput value={form.website} onChange={set("website")} aria-label="Site web" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="NIF">
          <TextInput value={form.nif} onChange={set("nif")} aria-label="NIF" />
        </Field>
        <Field label="Registre de commerce">
          <TextInput value={form.rc} onChange={set("rc")} aria-label="Registre de commerce" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="NIS" hint="N° d'identification statistique (facture).">
          <TextInput value={form.nis} onChange={set("nis")} aria-label="NIS" />
        </Field>
        <Field label="Article d'imposition" hint="Article fiscal (facture).">
          <TextInput
            value={form.article}
            onChange={set("article")}
            aria-label="Article d'imposition"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Préfixe factures" hint="Ex. FAC (factures suivantes).">
          <TextInput value={form.prefix} onChange={set("prefix")} aria-label="Préfixe factures" />
        </Field>
        <Field label="Logo" hint="PNG/JPEG ≤ 400 Ko, copié dans les données de l'application.">
          <div className="flex items-center gap-3">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Aperçu du logo"
                className="h-14 w-14 shrink-0 rounded-xl border border-white/10 bg-white object-contain p-1"
                draggable={false}
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/15 text-xs text-slate-500">
                Aucun
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              {form.logo !== "" ? (
                <p className="truncate font-mono text-[11px] text-slate-500" title={form.logo}>
                  {form.logo.split(/[/\\]/).pop()}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={chooseLogo}
                  disabled={busy}
                  className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-100 transition-colors hover:border-amber-400/40 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Choisir un fichier…
                </button>
                {form.logo !== "" ? (
                  <button
                    type="button"
                    onClick={removeLogo}
                    disabled={busy}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Retirer
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </Field>
      </div>
      <SaveBar busy={busy} onSave={save} label="Enregistrer l'entreprise" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Vente : défauts caisse + interrupteur crédit + préfixe.
// ---------------------------------------------------------------------------

interface SalesForm {
  defaultPaymentMethod: "cash" | "cheque" | "transfer";
  allowCreditSales: boolean;
  autoPrintInvoice: boolean;
}

export function SalesSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<SalesForm>("sales");
  const [form, setForm] = useState<SalesForm>({
    defaultPaymentMethod: "cash",
    allowCreditSales: true,
    autoPrintInvoice: false,
  });
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) setForm(value);
  }, [value]);

  function save(): void {
    void run(async () => {
      try {
        await saveAppSettings("sales", form);
        notify("Réglages vente enregistrés.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Vente" hint="Défauts de la caisse et garde-fou crédit.">
      <Field label="Moyen de paiement par défaut">
        <Select
          value={form.defaultPaymentMethod}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              defaultPaymentMethod: e.target.value as SalesForm["defaultPaymentMethod"],
            }))
          }
          aria-label="Moyen de paiement par défaut"
        >
          <option value="cash">Espèces</option>
          <option value="cheque">Chèque</option>
          <option value="transfer">Virement</option>
        </Select>
      </Field>
      <SwitchRow
        label="Autoriser les ventes à crédit"
        hint="Coupé = tout impayé refusé, même client autorisé."
        checked={form.allowCreditSales}
        onChange={(v) => setForm((f) => ({ ...f, allowCreditSales: v }))}
        ariaLabel="Autoriser les ventes à crédit"
      />
      <SwitchRow
        label="Impression auto après vente"
        hint="Ticket/facture envoyé sans aperçu."
        checked={form.autoPrintInvoice}
        onChange={(v) => setForm((f) => ({ ...f, autoPrintInvoice: v }))}
        ariaLabel="Impression auto après vente"
      />
      <SaveBar busy={busy} onSave={save} label="Enregistrer la vente" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Sons : interrupteur global des sons d'interface (WebAudio, aucun asset).
// ---------------------------------------------------------------------------

export function SoundSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<{ enabled: boolean; volume?: number }>("sound");
  const [enabled, setEnabled] = useState<boolean>(() => isSoundEnabled());
  const [volume, setVolume] = useState<number>(() => getSoundVolume());
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    // Lecture seule au chargement (pas d'écriture/audit : le SaveBar persiste).
    if (value && typeof value.enabled === "boolean") {
      setEnabled(value.enabled);
      setSoundEnabled(value.enabled);
    }
    if (value && value.volume !== undefined) {
      const v = clampVolume(value.volume);
      setVolume(v);
      setSoundVolume(v);
    }
  }, [value]);

  function save(): void {
    void run(async () => {
      try {
        await persistSoundEnabled(enabled, volume);
        if (enabled) playSound("success");
        notify("Sons enregistrés.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Sons" hint="Bips de caisse (vente, encaissement, erreurs).">
      <SwitchRow
        label="Activer les sons"
        hint="Coupé = caisse silencieuse."
        checked={enabled}
        onChange={(v) => {
          setEnabled(v);
          if (v) playSound("blip");
        }}
        ariaLabel="Activer les sons"
      />
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor="son-volume"
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
          >
            Volume
          </label>
          <span
            aria-hidden="true"
            className="font-mono text-xs font-bold tabular-nums text-slate-300"
          >
            {volume} %
          </span>
        </div>
        <input
          id="son-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          disabled={!enabled}
          aria-label={`Volume des sons, ${volume} pour cent`}
          onChange={(e) => {
            const v = clampVolume(Number(e.target.value));
            setVolume(v);
            setSoundVolume(v);
            // Aperçu immédiat (bridé anti-spam côté moteur).
            if (enabled) playSound("blip");
          }}
          className="w-full accent-[#fbbf24] disabled:opacity-40"
        />
        <p className="text-xs text-slate-500">0 = muet (l'interrupteur reste actif).</p>
      </div>
      <SaveBar busy={busy} onSave={save} label="Enregistrer les sons" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Produits : unité par défaut des nouvelles fiches.
// ---------------------------------------------------------------------------

const UNITS = ["PIECE", "KG", "G", "L", "ML", "M", "CARTON", "PAQUET", "AUTRE"];

export function ProductsSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<{ defaultUnit: string }>("products");
  const [unit, setUnit] = useState("PIECE");
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) setUnit(value.defaultUnit);
  }, [value]);

  function save(): void {
    void run(async () => {
      try {
        await saveAppSettings("products", { defaultUnit: unit });
        notify("Unité par défaut enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Produits" hint="Défauts des nouvelles fiches catalogue.">
      <Field label="Unité par défaut">
        <Select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          aria-label="Unité par défaut"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-slate-500">
        Codes-barres uniques garantis par la base. Quantités décimales toujours acceptées (kg,
        litres).
      </p>
      <SaveBar busy={busy} onSave={save} label="Enregistrer les produits" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Stock : seuil par défaut + stock négatif.
// ---------------------------------------------------------------------------

export function StockSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<{ allowNegativeStock: boolean; defaultMinStock: number }>(
    "inventory",
  );
  const [allowNegative, setAllowNegative] = useState(false);
  const [minStock, setMinStock] = useState("");
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) {
      setAllowNegative(value.allowNegativeStock);
      setMinStock(value.defaultMinStock > 0 ? String(value.defaultMinStock) : "");
    }
  }, [value]);

  function save(): void {
    const min = minStock.trim() === "" ? 0 : Number(minStock.replace(",", "."));
    if (!Number.isFinite(min) || min < 0 || min > 1_000_000) {
      notify("Seuil invalide.", "err");
      return;
    }
    void run(async () => {
      try {
        await saveAppSettings("inventory", {
          allowNegativeStock: allowNegative,
          defaultMinStock: min,
        });
        notify("Réglages stock enregistrés.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Stock" hint="Garde-fous et défauts d'inventaire.">
      <Field label="Seuil bas par défaut" hint="Pré-rempli sur les nouvelles fiches.">
        <TextInput
          value={minStock}
          onChange={(e) => setMinStock(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-label="Seuil bas par défaut"
        />
      </Field>
      <SwitchRow
        label="Autoriser le stock négatif (ventes)"
        hint="Caisse uniquement, jamais les ajustements."
        checked={allowNegative}
        onChange={setAllowNegative}
        ariaLabel="Autoriser le stock négatif"
      />
      <SaveBar busy={busy} onSave={save} label="Enregistrer le stock" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Clients : plafond par défaut (+ interrupteur global en Vente).
// ---------------------------------------------------------------------------

export function CustomersSection({
  notify,
  goSales,
}: {
  notify: Notify;
  goSales: () => void;
}): React.JSX.Element {
  const { value } = useAppSettings<{ defaultCreditLimitMinor: number }>("customers");
  const [limit, setLimit] = useState("");
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value && value.defaultCreditLimitMinor > 0) {
      setLimit(minorToInput(value.defaultCreditLimitMinor));
    }
  }, [value]);

  function save(): void {
    void run(async () => {
      try {
        // P1-5 : strict (bornes H-1, jamais NaN).
        const minor = strictOrNeg(limit, "Plafond");
        if (!Number.isInteger(minor) || minor < 0) {
          notify("Plafond invalide.", "err");
          return;
        }
        await saveAppSettings("customers", { defaultCreditLimitMinor: minor });
        notify("Plafond par défaut enregistré.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Clients" hint="Défauts des nouvelles fiches clients.">
      <Field label="Plafond de crédit par défaut (DZD)" hint="Pré-rempli à la création.">
        <TextInput
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          aria-label="Plafond par défaut"
        />
      </Field>
      <p className="text-xs text-slate-500">
        L'interrupteur général du crédit se trouve dans{" "}
        <button
          type="button"
          onClick={goSales}
          className="font-bold text-amber-200 hover:text-amber-100"
        >
          Vente
        </button>
        . Les relances se consultent dans Dettes.
      </p>
      <SaveBar busy={busy} onSave={save} label="Enregistrer les clients" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Annonce magasin (Q1) : message affiché en haut de l'application client.
// ---------------------------------------------------------------------------

export function AnnouncementSection({ notify }: { notify: Notify }): React.JSX.Element {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const { busy, run } = useBusyFlag();
  // Ref « vivant » : l Annonce peut être quittée avant la réponse IPC.
  const alive = useRef(true);

  // Lecture de l'annonce courante : sans elle, le gérant écrirait dans le vide
  // (Q1 — l'audit : « la saisie commerçante côté POS manque »).
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const res = (await api.announcementGet()) as { text?: string | null };
        if (!alive.current) return;
        setText(typeof res.text === "string" ? res.text : "");
      } catch (e) {
        if (!alive.current) return;
        notify(frError(e, "Annonce actuelle indisponible."), "err");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [notify]);

  function save(): void {
    void run(async () => {
      try {
        const clean = text.trim();
        // Règle du domaine (1..120 caractères) : message FR immédiat, avant
        // l'aller-retour IPC.
        assertValidAnnouncement(clean);
        await api.announcementSave({ operationId: newOperationId(), text: clean });
        notify("Annonce enregistrée : visible dans l'application client.", "ok");
      } catch (e) {
        notify(frError(e, "Annonce impossible à enregistrer."), "err");
      }
    });
  }

  return (
    <Section
      title="Annonce magasin"
      hint="Message affiché en haut de l'application client (APK). 120 caractères maximum."
    >
      <Field label="Annonce" hint={loading ? "Lecture…" : `${text.trim().length}/120 caractères`}>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={120}
          disabled={loading}
          placeholder="Livraison exceptionnelle ce samedi."
          aria-label="Annonce magasin"
        />
      </Field>
      <SaveBar busy={busy} onSave={save} label="Enregistrer l'annonce" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Fournisseurs : moyen de paiement par défaut des règlements.
// ---------------------------------------------------------------------------

export function SuppliersSection({ notify }: { notify: Notify }): React.JSX.Element {
  const { value } = useAppSettings<{ defaultPaymentMethod: "cash" | "cheque" | "transfer" }>(
    "suppliers",
  );
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const { busy, run } = useBusyFlag();

  useEffect(() => {
    if (value) setMethod(value.defaultPaymentMethod);
  }, [value]);

  function save(): void {
    void run(async () => {
      try {
        await saveAppSettings("suppliers", { defaultPaymentMethod: method });
        notify("Moyen par défaut enregistré.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  return (
    <Section title="Fournisseurs" hint="Défauts des règlements fournisseurs.">
      <Field label="Moyen de paiement par défaut">
        <Select
          value={method}
          onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
          aria-label="Moyen de paiement par défaut"
        >
          <option value="cash">Espèces</option>
          <option value="cheque">Chèque</option>
          <option value="transfer">Virement</option>
        </Select>
      </Field>
      <p className="text-xs text-slate-500">
        Les codes fournisseurs (FOU-…) sont dérivés et stables. Les relances se consultent dans
        Dettes.
      </p>
      <SaveBar busy={busy} onSave={save} label="Enregistrer les fournisseurs" />
    </Section>
  );
}
