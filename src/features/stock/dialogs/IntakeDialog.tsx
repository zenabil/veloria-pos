// Veloria PoS — Stock : réception + détail + ajustement + historique + inventaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import {
  ChevronDown,
  PackagePlus,
  Plus,
  ReceiptText,
  StickyNote,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd, minorToInput } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { unitLabel } from "@domain/units/units.ts";

import {
  Badge,
  Button,
  Card,
  Field,
  Kbd,
  Modal,
  SearchField,
  TextArea,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { FormSection } from "@shared/ui/form-section.tsx";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { uppercaseBarcodeInput } from "@shared/ui/barcode-input.ts";
import { SupplierQuickCreateDialog } from "@features/suppliers/dialogs/FormDialog.tsx";

import { parseQuantityInput } from "@domain/common/quantity.ts";
import { strictOrNum } from "@shared/money/parse.ts";
import { suggestIntakeInvoiceNumber } from "../types.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Réception fournisseur : facture directe + livraison + coût unitaire.
// Backend atomique existant (stock.intake) : entrée + lignes + mouvements +
// quantités + solde fournisseur + audit = 1 transaction.
// ---------------------------------------------------------------------------

interface IntakeLine {
  key: number;
  productId: number | null;
  productName: string;
  unit: string;
  received: string;
  /** TOUJOURS en unités de base (pièces). */
  damaged: string;
  price: string;
  /** Prix de vente par ligne (DZD, saisie FR) : vide = conserver l'actuel. */
  selling: string;
  search: string;
  /** Ligne libre : crée un produit au catalogue avec le nom saisi. */
  freeMode: boolean;
  packagingId: number | null;
  packagingFactor: number | null;
  packagingLabel: string | null;
  packagingPurchasePriceMinor: number | null;
  /** Unité d'achat choisie : le prix et la quantité reçue suivent ce choix. */
  purchaseUnit: "piece" | "carton";
  results: {
    id: number;
    name: string;
    unit_code: string;
    quantity: number;
    packaging_id?: number | null;
    packaging_label_fr?: string | null;
    packaging_factor?: number | null;
    packaging_purchase_price_minor?: number | null;
  }[];
}

/** Ligne d'une réception existante, préremplie après annulation (ADR-139). */
export interface StockIntakeInitialLine {
  productId: number | null;
  productName: string;
  unitCode: string;
  quantityReceived: number;
  quantityDamaged: number;
  /** Prix d'achat par UNITÉ D'ACHAT (carton ou pièce), hors fret. */
  purchasePriceMinor: number;
  packagingId: number | null;
  packagingLabel: string | null;
  packagingFactor: number | null;
  purchaseUnit: "piece" | "carton";
}

export interface StockIntakeInitial {
  supplierId: number | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  shippingMinor: number;
  notes: string;
  lines: StockIntakeInitialLine[];
}

let intakeKey = 1;

function initialIntakeLine(l: StockIntakeInitialLine): IntakeLine {
  intakeKey += 1;
  return {
    key: intakeKey,
    productId: l.productId,
    productName: l.productName,
    unit: l.unitCode || "PIECE",
    received: String(l.quantityReceived),
    damaged: String(l.quantityDamaged),
    price: minorToInput(Math.max(0, l.purchasePriceMinor)),
    selling: "",
    search: "",
    freeMode: l.productId == null && l.productName.trim() !== "",
    packagingId: l.packagingId,
    packagingFactor: l.packagingFactor,
    packagingLabel: l.packagingLabel,
    packagingPurchasePriceMinor: null,
    purchaseUnit: l.purchaseUnit,
    results: [],
  };
}

function emptyIntakeLine(): IntakeLine {
  intakeKey += 1;
  return {
    key: intakeKey,
    productId: null,
    productName: "",
    unit: "PIECE",
    received: "1",
    damaged: "0",
    price: "",
    selling: "",
    search: "",
    freeMode: false,
    packagingId: null,
    packagingFactor: null,
    packagingLabel: null,
    packagingPurchasePriceMinor: null,
    purchaseUnit: "piece",
    results: [],
  };
}

/** Ligne réellement touchée par l'utilisateur (une ligne neuve ne bloque pas). */
function hasIntakeInput(l: IntakeLine): boolean {
  return (
    l.productId != null ||
    l.freeMode ||
    l.search.trim() !== "" ||
    l.productName.trim() !== "" ||
    l.price.trim() !== "" ||
    l.selling.trim() !== "" ||
    l.received.trim() !== "1" ||
    l.damaged.trim() !== "0"
  );
}

export function StockIntakeDialog({
  onClose,
  onSaved,
  notify,
  initial,
}: {
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
  /** Réédition d'une facture annulée : valeurs d'origine préremplies. */
  initial?: StockIntakeInitial;
}): React.JSX.Element {
  const [supplierId, setSupplierId] = useState<number | null>(initial?.supplierId ?? null);
  const [supplierLabel, setSupplierLabel] = useState(initial?.supplierName ?? "");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierResults, setSupplierResults] = useState<
    { id: number; name: string; code: string | null }[]
  >([]);
  const supplierTimer = useDebouncedTimer();
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoiceDate || todayUtcDate());
  const [shipping, setShipping] = useState(
    initial != null && initial.shippingMinor > 0 ? minorToInput(initial.shippingMinor) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<IntakeLine[]>(() =>
    initial != null && initial.lines.length > 0
      ? initial.lines.map(initialIntakeLine)
      : [emptyIntakeLine()],
  );
  const [busy, setBusy] = useState(false);
  // Création inline : modale par-dessus, réception conservée.
  const [supplierQuickOpen, setSupplierQuickOpen] = useState(false);
  // Fournisseur replié par défaut (optionnel) : la recherche n'occupe
  // l'espace que lorsque l'utilisateur la demande.
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState((initial?.notes ?? "").trim() !== "");
  // Clé d'idempotence stable par facture (générée à l'ouverture) : un double-clic
  // ou un retry IPC rejoue le même operationId → la réception n'est créée qu'une fois.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());

  async function searchSuppliers(q: string = supplierQ): Promise<void> {
    try {
      const res = (await api.supplierSearch({
        query: q.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; name: string; code: string | null }[] };
      setSupplierResults(res.rows.map((s) => ({ id: s.id, name: s.name, code: s.code ?? null })));
    } catch (e) {
      // Recherche d'arrière-plan (frappe au clavier) : journal seul, sans
      // toast (anti-spam) — la liste vide signifie « pas de réponse serveur ».
      console.error("[Veloria] fournisseurs : recherche illisible", e);
      setSupplierResults([]);
    }
  }

  // Liste initiale : les premiers fournisseurs sont visibles dès l'ouverture
  // (un clic suffit quand il y en a peu). Recherche en direct au-delà.
  useEffect(() => {
    void searchSuppliers("");
  }, []);

  function onSupplierQChange(q: string): void {
    setSupplierQ(q);
    // Vide = retour à la liste initiale ; 1 lettre = on garde la liste ;
    // 2+ = recherche serveur (debounce comme les autres écrans).
    if (q.trim() === "") {
      supplierTimer.schedule(150, () => {
        void searchSuppliers("");
      });
    } else if (q.trim().length >= 2) {
      supplierTimer.schedule(250, () => {
        void searchSuppliers(q);
      });
    } else {
      supplierTimer.cancel();
    }
  }

  function pickSupplier(s: { id: number; name: string; code: string | null }): void {
    setSupplierId(s.id);
    setSupplierLabel(s.name);
    setSupplierResults([]);
    setSupplierQ("");
    // Numéro de facture suggéré à la sélection (modififiable) — seulement
    // si le champ est encore vide (ne jamais écraser la saisie).
    if (invoiceNumber.trim() === "") {
      setInvoiceNumber(suggestIntakeInvoiceNumber(s.code));
    }
  }

  function toggleSupplierPicker(): void {
    const next = !supplierPickerOpen;
    setSupplierPickerOpen(next);
    // La liste a pu être vidée par une sélection précédente : on la recharge
    // à l'ouverture, sinon le panneau afficherait « aucun fournisseur » à tort.
    if (next && supplierResults.length === 0 && supplierQ.trim() === "") {
      void searchSuppliers("");
    }
  }

  function onSupplierCreated(s: { id: number; name: string; code: string | null }): void {
    setSupplierQuickOpen(false);
    pickSupplier(s);
    notify(`Fournisseur « ${s.name} » créé et sélectionné.`, "ok");
    void searchSuppliers("");
  }

  async function searchProducts(key: number, q: string): Promise<void> {
    if (q.trim().length < 2) {
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, results: [] } : l)));
      return;
    }
    try {
      const res = (await api.stockProducts({ query: q.trim(), page: 1, pageSize: 8 })) as {
        rows: IntakeLine["results"];
      };
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, results: res.rows } : l)));
    } catch (e) {
      // Recherche d'arrière-plan : journal seul, sans toast (anti-spam).
      console.error("[Veloria] réception : produits illisibles", e);
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, results: [] } : l)));
    }
  }

  function patchLine(key: number, patch: Partial<IntakeLine>): void {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function focusIntakeLine(key: number): void {
    document
      .querySelector<HTMLElement>(`[data-intake-line="${key}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function selectProduct(key: number, r: IntakeLine["results"][number]): void {
    patchLine(key, {
      productId: r.id,
      productName: r.name,
      unit: r.unit_code,
      packagingId: r.packaging_id ?? null,
      packagingFactor: r.packaging_factor ?? null,
      packagingLabel: r.packaging_label_fr ?? null,
      packagingPurchasePriceMinor: r.packaging_purchase_price_minor ?? null,
      purchaseUnit: "piece",
      results: [],
      search: "",
      freeMode: false,
    });
  }

  // P1-5 : parse strict (bornes H-1, jamais NaN). Invalide → -1 sentinelle :
  // tous les gardes existants (`isInteger && >= 0`) le rejettent, le type
  // reste `number` pour les calculs aval.
  // W7 (D-07) : la copie locale est supprimée — `strictOrNum` est désormais
  // la source unique (`@shared/money/parse.ts`).

  const parsed = lines.map((l) => {
    const factor =
      l.purchaseUnit === "carton" && l.packagingId != null && (l.packagingFactor ?? 0) > 1
        ? (l.packagingFactor as number)
        : 1;
    const received = parseQuantityInput(l.received.trim() === "" ? "0" : l.received, {
      allowZero: true,
    });
    const damaged = parseQuantityInput(l.damaged.trim() === "" ? "0" : l.damaged, {
      allowZero: true,
    });
    const price = strictOrNum(l.price.trim() === "" ? "0" : l.price);
    // Saisie vide = null (conserver) ; sinon centimes validés (>= 0).
    const sellingRaw = l.selling.trim();
    const selling = sellingRaw === "" ? null : strictOrNum(sellingRaw);
    const sellingOk = selling === null || (Number.isInteger(selling) && selling >= 0);
    const baseReceived = received != null ? Math.round(received * factor * 1000) / 1000 : null;
    const net =
      baseReceived != null && damaged != null
        ? Math.round((baseReceived - damaged) * 1000) / 1000
        : null;
    // Total payé = prix d'achat × unités reçues (abîmés inclus dans le coût).
    const lineTotal =
      received != null && Number.isInteger(price) && price >= 0 && received > 0
        ? Math.round(price * received)
        : 0;
    const name = l.productId != null ? l.productName : l.productName.trim();
    const cartonQtyOk = factor === 1 || (received != null && Number.isInteger(received));
    const damagedIntegerOk = factor === 1 || (damaged != null && Number.isInteger(damaged));
    const valid =
      name.length > 0 &&
      received != null &&
      received > 0 &&
      damaged != null &&
      damaged >= 0 &&
      (net ?? 0) > 0 &&
      baseReceived != null &&
      damaged <= baseReceived &&
      cartonQtyOk &&
      damagedIntegerOk &&
      Number.isInteger(price) &&
      price >= 0 &&
      sellingOk;
    return {
      ...l,
      factor,
      baseReceived,
      received,
      damaged,
      price,
      selling,
      net,
      lineTotal,
      valid,
      sellingOk,
    };
  });
  const subtotal = parsed.reduce((a, l) => a + (l.valid ? l.lineTotal : 0), 0);
  const shippingMinor = shipping.trim() === "" ? 0 : strictOrNum(shipping);
  const shippingOk = Number.isInteger(shippingMinor) && shippingMinor >= 0;
  const total = shippingOk ? subtotal + shippingMinor : subtotal;
  const withLanding = parsed.map((l) => {
    if (!l.valid || (l.net ?? 0) <= 0) return { ...l, share: 0, landing: l.price };
    const share =
      subtotal > 0 && shippingOk ? Math.round((shippingMinor * l.lineTotal) / subtotal) : 0;
    const landing = Math.round((l.lineTotal + share) / (l.net as number));
    return { ...l, share, landing };
  });
  const touchedInvalidCount = withLanding.filter((l, i) => {
    const raw = lines[i];
    return raw != null && hasIntakeInput(raw) && !l.valid;
  }).length;
  const showTotal = shippingOk && touchedInvalidCount === 0 && withLanding.some((l) => l.valid);

  async function save(): Promise<void> {
    if (busy) return;
    if (invoiceDate === "") {
      notify("Date de facture requise.", "err");
      return;
    }
    if (!shippingOk) {
      notify("Frais de livraison invalides.", "err");
      return;
    }
    const badSelling = withLanding.find((l, i) => {
      const raw = lines[i];
      return raw != null && hasIntakeInput(raw) && !l.sellingOk;
    });
    if (badSelling) {
      focusIntakeLine(badSelling.key);
      notify("Prix de vente invalide (montant >= 0 ou vide).", "err");
      return;
    }
    // Ne jamais ignorer silencieusement une ligne commencée mais incomplète :
    // l'utilisateur croirait qu'elle a été réceptionnée.
    const incomplete = withLanding
      .map((l, i) => ({ l, raw: lines[i], n: i + 1 }))
      .filter(({ l, raw }) => raw != null && hasIntakeInput(raw) && !l.valid);
    if (incomplete.length > 0) {
      const nums = incomplete.map(({ n }) => n).join(", ");
      const first = incomplete[0];
      if (first != null) focusIntakeLine(first.l.key);
      notify(
        `Ligne(s) ${nums} incomplète(s) : produit, quantité > 0 et prix d'achat sont requis.`,
        "err",
      );
      return;
    }
    const clean = withLanding.filter((l) => l.valid);
    if (clean.length === 0) {
      notify("Ajoutez au moins une ligne valide (produit + quantité + prix).", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.stockIntake({
        operationId,
        supplierId,
        invoiceNumber: invoiceNumber.trim() === "" ? null : invoiceNumber.trim(),
        invoiceDate,
        shippingMinor,
        notes: notes.trim() === "" ? null : notes.trim(),
        lines: clean.map((l) => ({
          productId: l.productId,
          productName: l.productId != null ? l.productName : l.productName.trim(),
          quantityReceived: Number(l.received),
          quantityDamaged: typeof l.damaged === "number" ? l.damaged : 0,
          purchasePriceMinor: l.price,
          sellingPriceMinor: l.selling,
          packagingId: l.purchaseUnit === "carton" && l.packagingId != null ? l.packagingId : null,
          unitFactor: l.factor,
        })),
      })) as { intakeId: number; totalMinor: number };
      notify(`Réception #${res.intakeId} enregistrée : ${formatDzd(res.totalMinor)}.`, "ok");
      // P5 : réception validée = succès.
      playSound("success");
      // Facture suivante = nouvelle clé (la clé actuelle reste liée à la facture créée).
      setOperationId(newOperationId());
      onSaved();
    } catch (e) {
      // Échec : on conserve le même operationId pour que le retry soit idempotent.
      notify(frError(e, "Réception impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        label="Réception fournisseur"
        title={
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fbbf24]/10 text-[#fbbf24] ring-1 ring-[#fbbf24]/20"
            >
              <Truck size={16} />
            </span>
            <span>Réception fournisseur</span>
          </span>
        }
        onClose={onClose}
        extraWide
      >
        <form
          className="space-y-3.5 [&_input]:scroll-mb-24 [&_select]:scroll-mb-24 [&_textarea]:scroll-mb-24"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName ?? "";
            const withCtrl = e.ctrlKey || e.metaKey;
            // Zone de texte : Entrée = nouvelle ligne ; Ctrl+Entrée = valider.
            if (tag === "TEXTAREA") {
              if (withCtrl) {
                e.preventDefault();
                void save();
              }
              return;
            }
            // Boutons/liens : laisser l'activation clavier native.
            if (tag === "BUTTON" || tag === "A") return;
            // Aucun envoi implicite depuis un champ (réception = action
            // irréversible) : seul Ctrl+Entrée valide.
            e.preventDefault();
            if (withCtrl) void save();
          }}
        >
          <p className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            <ReceiptText size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-[#fbbf24]" />
            <span>
              Stock, mouvements, dette fournisseur et audit sont mis à jour en une seule
              transaction. Une facture se corrige depuis « Réceptions ».
            </span>
          </p>

          <FormSection
            icon={<ReceiptText size={14} aria-hidden="true" />}
            title="Facture fournisseur"
          >
            <div>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Fournisseur
              </span>
              {supplierId != null ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Truck size={15} className="shrink-0 text-emerald-300" aria-hidden="true" />
                    <span className="truncate font-semibold">{supplierLabel}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierId(null);
                        setSupplierLabel("");
                        setSupplierPickerOpen(true);
                        void searchSuppliers("");
                      }}
                      className="text-xs font-semibold text-amber-300 hover:text-amber-200"
                    >
                      Changer
                    </button>
                    <button
                      type="button"
                      aria-label="Retirer le fournisseur"
                      title="Retirer le fournisseur"
                      onClick={() => {
                        setSupplierId(null);
                        setSupplierLabel("");
                        setSupplierPickerOpen(false);
                      }}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    aria-expanded={supplierPickerOpen}
                    aria-controls="intake-supplier-picker"
                    onClick={toggleSupplierPicker}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-white/15 bg-black/25 px-3 py-2.5 text-left transition-colors hover:border-amber-400/40 hover:bg-white/[0.03]"
                  >
                    <Truck size={15} className="shrink-0 text-slate-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-400">
                      Aucun fournisseur sélectionné
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-amber-300">
                      {supplierPickerOpen ? "Fermer" : "Choisir"}
                    </span>
                  </button>
                  {supplierPickerOpen ? (
                    <div
                      id="intake-supplier-picker"
                      className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5"
                    >
                      <div className="flex gap-2">
                        <SearchField
                          value={supplierQ}
                          onChange={onSupplierQChange}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const first = supplierResults[0];
                              if (supplierQ.trim().length >= 2 && first != null)
                                pickSupplier(first);
                              else void searchSuppliers(supplierQ);
                            }
                          }}
                          placeholder="Rechercher un fournisseur…"
                          ariaLabel="Rechercher un fournisseur"
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setSupplierQuickOpen(true)}
                          aria-label="Créer un fournisseur"
                          title="Créer un fournisseur sans perdre la réception"
                          className="shrink-0 px-3"
                        >
                          <Plus size={15} aria-hidden="true" />
                          <span className="hidden sm:inline">Nouveau</span>
                        </Button>
                      </div>
                      {supplierResults.length > 0 ? (
                        <ul className="max-h-40 divide-y divide-white/[0.06] overflow-auto rounded-lg border border-white/10">
                          {supplierResults.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => pickSupplier(s)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
                              >
                                <span className="truncate font-semibold">{s.name}</span>
                                {s.code ? (
                                  <span className="shrink-0 font-mono text-[10px] text-slate-500">
                                    {s.code}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : supplierQ.trim().length >= 2 ? (
                        <p className="text-xs text-slate-400">
                          Aucun fournisseur trouvé — créez-le ici.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">Aucun fournisseur enregistré.</p>
                      )}
                    </div>
                  ) : null}
                </>
              )}
              <p className="mt-1.5 text-[11px] text-slate-500">
                Optionnel — alimente la dette fournisseur.
              </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Field label="N° facture" hint="Suggéré au choix du fournisseur.">
                <TextInput
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ex. : FAC-FOU-001"
                  aria-label="Numéro de facture"
                  className="font-mono"
                />
              </Field>
              <Field label="Date facture *">
                <TextInput
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  aria-label="Date de facture"
                />
              </Field>
              <Field label="Livraison (DZD) *" hint="Répartie sur chaque produit, au prorata.">
                <TextInput
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label="Frais de livraison"
                  className="font-mono tabular-nums"
                />
              </Field>
            </div>
          </FormSection>
          <FormSection
            icon={<PackagePlus size={14} aria-hidden="true" />}
            title="Articles reçus"
            hint={`${lines.length} ligne${lines.length > 1 ? "s" : ""}`}
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((p) => [...p, emptyIntakeLine()])}
                className="px-3 py-1.5 text-xs"
              >
                <Plus size={14} aria-hidden="true" /> Ajouter une ligne
              </Button>
            }
          >
            {withLanding.map((l, idx) => {
              const raw = lines[idx];
              const touched = raw != null && hasIntakeInput(raw);
              const invalid = touched && !l.valid;
              const unitFr = unitLabel(l.unit);
              const unitShort = l.unit === "PIECE" ? "pièce" : l.unit.toLowerCase();
              const priceUnit = l.purchaseUnit === "carton" ? "carton" : unitShort;
              return (
                <Card
                  key={l.key}
                  className={cn("overflow-hidden p-0", invalid && "border-amber-400/35")}
                >
                  <div
                    data-intake-line={l.key}
                    className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-3 py-2"
                  >
                    <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300">
                      Ligne {idx + 1}
                    </span>
                    {l.productId != null ? (
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                        {unitFr}
                        {l.packagingFactor != null
                          ? ` · ${l.packagingLabel ?? `Carton de ${l.packagingFactor}`}`
                          : ""}
                      </span>
                    ) : (
                      <span className="flex-1" />
                    )}
                    {invalid ? <Badge tone="amber">À compléter</Badge> : null}
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Retirer la ligne ${idx + 1}`}
                        title="Retirer la ligne"
                        onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                        className="rounded p-1 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-2.5 p-3">
                    {l.productId != null ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <PackagePlus
                            size={15}
                            className="shrink-0 text-emerald-300"
                            aria-hidden="true"
                          />
                          <span className="truncate font-semibold">{l.productName}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            patchLine(l.key, {
                              productId: null,
                              productName: "",
                              search: "",
                              freeMode: false,
                              unit: "PIECE",
                              received: "1",
                              damaged: "0",
                              price: "",
                              selling: "",
                              packagingId: null,
                              packagingFactor: null,
                              packagingLabel: null,
                              packagingPurchasePriceMinor: null,
                              purchaseUnit: "piece",
                              results: [],
                            })
                          }
                          className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
                        >
                          Changer
                        </button>
                      </div>
                    ) : l.freeMode ? (
                      <div className="space-y-2">
                        <Field
                          label="Nom du nouveau produit"
                          hint="Sera créé au catalogue (unité Pièce)."
                        >
                          <TextInput
                            value={lines[idx]?.productName ?? ""}
                            onChange={(e) => patchLine(l.key, { productName: e.target.value })}
                            placeholder="Ex. : Sac de riz 5 kg"
                            aria-label={`Produit ligne ${idx + 1}`}
                          />
                        </Field>
                        <button
                          type="button"
                          onClick={() => patchLine(l.key, { freeMode: false, productName: "" })}
                          className="text-xs font-semibold text-amber-300 hover:text-amber-200"
                        >
                          ← Rechercher un produit existant
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Produit *
                        </span>
                        <SearchField
                          value={l.search}
                          onChange={(v) => {
                            const query = uppercaseBarcodeInput(v);
                            patchLine(l.key, { search: query });
                            void searchProducts(l.key, query);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const first = l.results[0];
                              if (first != null) selectProduct(l.key, first);
                            }
                          }}
                          placeholder="Nom ou code-barres…"
                          ariaLabel={`Rechercher produit ligne ${idx + 1}`}
                        />
                        {l.results.length > 0 ? (
                          <ul className="max-h-40 divide-y divide-white/[0.06] overflow-auto rounded-lg border border-white/10">
                            {l.results.map((r) => (
                              <li key={r.id}>
                                <button
                                  type="button"
                                  onClick={() => selectProduct(l.key, r)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
                                >
                                  <span className="truncate font-semibold">{r.name}</span>
                                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-400">
                                    {r.quantity} {unitLabel(r.unit_code)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : l.search.trim().length >= 2 ? (
                          <p className="text-xs text-slate-400">
                            Aucun produit trouvé — utilisez « Nouveau produit par nom ».
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            patchLine(l.key, { freeMode: true, search: "", results: [] })
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
                        >
                          <Plus size={13} aria-hidden="true" /> Nouveau produit par nom
                        </button>
                      </div>
                    )}
                    {l.packagingId != null && l.packagingFactor != null ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2">
                        <span className="text-xs font-semibold text-slate-300">
                          Unité d'achat :
                        </span>
                        <div role="group" aria-label="Unité d'achat" className="flex gap-1.5">
                          <Button
                            type="button"
                            variant={l.purchaseUnit === "carton" ? "primary" : "secondary"}
                            aria-pressed={l.purchaseUnit === "carton"}
                            onClick={() => {
                              patchLine(l.key, {
                                purchaseUnit: "carton",
                                price:
                                  (lines[idx]?.price ?? "").trim() === "" &&
                                  l.packagingPurchasePriceMinor != null
                                    ? (l.packagingPurchasePriceMinor / 100)
                                        .toFixed(2)
                                        .replace(".", ",")
                                    : (lines[idx]?.price ?? ""),
                              });
                            }}
                            title={l.packagingLabel ?? `Carton de ${l.packagingFactor}`}
                            className="px-2.5 py-1.5 text-xs"
                          >
                            {l.packagingLabel ?? `Carton de ${l.packagingFactor}`}
                          </Button>
                          <Button
                            type="button"
                            variant={l.purchaseUnit === "piece" ? "primary" : "secondary"}
                            aria-pressed={l.purchaseUnit === "piece"}
                            onClick={() => patchLine(l.key, { purchaseUnit: "piece" })}
                            className="px-2.5 py-1.5 text-xs"
                          >
                            {unitFr}
                          </Button>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          1 carton = {l.packagingFactor} {unitShort}
                          {l.unit === "PIECE" ? "(s)" : ""}
                        </span>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                      <Field
                        label={`Reçue *${
                          l.purchaseUnit === "carton" ? " (cartons)" : ` (${unitShort})`
                        }`}
                      >
                        <TextInput
                          value={lines[idx]?.received ?? ""}
                          onChange={(e) => patchLine(l.key, { received: e.target.value })}
                          inputMode="decimal"
                          aria-label={`Quantité reçue ligne ${idx + 1}`}
                          className="font-mono tabular-nums"
                        />
                      </Field>
                      <Field
                        label={`Abîmée (${unitShort})`}
                        {...(l.purchaseUnit === "carton" ? { hint: "Entier requis." } : {})}
                      >
                        <TextInput
                          value={lines[idx]?.damaged ?? ""}
                          onChange={(e) => patchLine(l.key, { damaged: e.target.value })}
                          inputMode="decimal"
                          aria-label={`Quantité abîmée ligne ${idx + 1}`}
                          className="font-mono tabular-nums"
                        />
                      </Field>
                      <Field label={`Prix d'achat / ${priceUnit} *`} hint="Hors livraison.">
                        <TextInput
                          value={lines[idx]?.price ?? ""}
                          onChange={(e) => patchLine(l.key, { price: e.target.value })}
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label={`Prix achat ligne ${idx + 1}`}
                          className="font-mono tabular-nums"
                        />
                      </Field>
                      <Field
                        label={`Prix de vente / ${unitShort}`}
                        hint={l.freeMode ? "Vide = 0 DZD." : "Vide = conserver."}
                      >
                        <TextInput
                          value={lines[idx]?.selling ?? ""}
                          onChange={(e) => patchLine(l.key, { selling: e.target.value })}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Prix de vente ligne ${idx + 1}`}
                          className="font-mono tabular-nums"
                        />
                      </Field>
                    </div>
                    {l.valid ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-black/25 px-3 py-2 text-[11px] text-slate-400">
                        <span>
                          Net{" "}
                          <strong className="font-mono text-slate-200">
                            {l.net} {unitShort}
                          </strong>
                        </span>
                        <span>
                          Total ligne{" "}
                          <strong className="font-mono text-slate-200">
                            {formatDzd(l.lineTotal)}
                          </strong>
                        </span>
                        {l.share > 0 ? (
                          <span>
                            Frais{" "}
                            <strong className="font-mono text-slate-200">
                              {formatDzd(l.share)}
                            </strong>
                          </span>
                        ) : null}
                        <span className="text-amber-200">
                          Coût rendu / {unitShort} (livraison incluse){" "}
                          <strong className="font-mono">{formatDzd(l.landing)}</strong>
                        </span>
                        {l.selling != null ? (
                          <span className="text-emerald-200">
                            Nouveau prix{" "}
                            <strong className="font-mono">{formatDzd(l.selling)}</strong>
                          </span>
                        ) : null}
                      </div>
                    ) : touched ? (
                      <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] font-semibold text-amber-200">
                        Ligne à compléter — produit, quantité &gt; 0 et prix d'achat requis.
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Choisissez un produit existant ou créez-le par son nom, puis saisissez la
                        quantité et le prix d'achat.
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
            {shippingMinor > 0 && shippingOk && withLanding.some((l) => l.valid) ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">
                    Répartition de la livraison
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-slate-400">
                    {formatDzd(shippingMinor)} · {withLanding.filter((l) => l.valid).length}{" "}
                    produit(s)
                  </p>
                </div>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {withLanding
                    .filter((l) => l.valid)
                    .map((l) => {
                      const unitShort = l.unit === "PIECE" ? "pièce" : l.unit.toLowerCase();
                      return (
                        <li
                          key={`share-${l.key}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px]"
                        >
                          <span className="min-w-0 truncate font-semibold text-slate-200">
                            {l.productName}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-slate-400">
                            +{formatDzd(l.share)} →{" "}
                            <strong className="text-amber-200">
                              {formatDzd(l.landing)}/{unitShort}
                            </strong>
                          </span>
                        </li>
                      );
                    })}
                </ul>
                <p className="mt-2 text-[11px] text-slate-500">
                  Chaque produit enregistre ce coût rendu (livraison incluse) dans sa fiche.
                </p>
              </div>
            ) : null}
          </FormSection>
          <div className="rounded-xl border border-white/[0.08] bg-black/25">
            <button
              type="button"
              aria-expanded={notesOpen}
              aria-controls="intake-notes"
              onClick={() => setNotesOpen((o) => !o)}
              className="flex min-h-[48px] w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-slate-400"
              >
                <StickyNote size={14} />
              </span>
              <span className="text-sm font-bold text-slate-200">Notes de réception</span>
              <span className="ml-auto text-[11px] text-slate-500">
                {notes.trim() === "" ? "Optionnel" : "Note saisie"}
              </span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-slate-400 transition-transform",
                  notesOpen && "rotate-180",
                )}
              />
            </button>
            {notesOpen ? (
              <div id="intake-notes" className="border-t border-white/[0.08] p-3.5">
                <TextArea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Précisez le motif ou une information utile…"
                  aria-label="Notes de réception"
                />
              </div>
            ) : null}
          </div>
          <div className="sticky bottom-0 z-10 -mx-6 flex flex-col gap-3 border-t border-white/10 bg-[#122131]/95 px-6 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Total réception
                </span>
                <strong
                  className={cn(
                    "font-mono text-xl font-extrabold tabular-nums",
                    shippingOk ? "text-amber-300" : "text-red-300",
                  )}
                >
                  {showTotal ? formatDzd(total) : "—"}
                </strong>
              </div>
              <p className="text-[11px] tabular-nums text-slate-500">
                Sous-total {formatDzd(subtotal)} · Livraison{" "}
                {shippingOk ? formatDzd(shippingMinor) : "invalide"}
                {touchedInvalidCount > 0 ? ` · ${touchedInvalidCount} ligne(s) à compléter` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1 text-[11px] text-slate-500 lg:flex">
                <Kbd>Ctrl</Kbd>
                <span>+</span>
                <Kbd>Entrée</Kbd>
              </span>
              <div className="flex flex-1 gap-2 sm:flex-none">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  className="flex-1 sm:flex-none sm:min-w-[108px]"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={busy}
                  title="Valider la réception (Ctrl+Entrée)"
                  className="flex-[2] sm:flex-none sm:min-w-[190px]"
                >
                  {busy ? "Enregistrement…" : "Valider la réception"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Modal>
      {supplierQuickOpen ? (
        <SupplierQuickCreateDialog
          onClose={() => setSupplierQuickOpen(false)}
          onCreated={onSupplierCreated}
          notify={notify}
        />
      ) : null}
    </>
  );
}
